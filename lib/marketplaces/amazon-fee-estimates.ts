import {hash,type ProductInput} from '../catalog/model';
import {CatalogError} from '../catalog/repository';
import {isNumericInput} from '../catalog/numeric-input';
export type AmazonFeeTarget={sku:string;seller_id:string;marketplace_id:string;id_type:'ASIN'|'SellerSKU';id_value:string;price:number;shipping_charge:number;fulfillment:'FBM'|'FBA';currency:'USD';request_identifier:string};
export type AmazonFeeEstimate={version:1;kind:'estimate';source:'amazon_product_fees_api';channel:'amazon-us';target:AmazonFeeTarget;checked_at:string;estimated_at:string;expires_at:string;total_fees:number;details:{type:string;final_fee:number;tax_amount:number|null;included:unknown[]}[];snapshot_hash:string};
export function amazonFeeTarget(product:ProductInput,config:{sellerId:string;marketplaceId:string}):AmazonFeeTarget{
 const price=Number(product.price),shipping=Number(product.shipping_charge),sku=String(product.sku||'');
 if(product.relationship==='Parent'||!['FBM','FBA'].includes(String(product.fulfillment)))throw new CatalogError('Tarifas exigem oferta standalone/filho e fulfillment FBM ou FBA.',422);
 if(!sku||sku.length>200||/[\x00-\x1f\x7f]/.test(sku))throw new CatalogError('SKU inválido para consulta de tarifas.');
 if(product.currency!==undefined&&product.currency!=='USD'||!isNumericInput(product.price)||price<=0||!Number.isSafeInteger(Math.round(price*100))||Math.abs(price*100-Math.round(price*100))>0.00001)throw new CatalogError('Preço deve ser positivo, em USD e com até duas casas decimais.');
 if(!isNumericInput(product.shipping_charge)||shipping<0||!Number.isSafeInteger(Math.round(shipping*100))||Math.abs(shipping*100-Math.round(shipping*100))>0.00001)throw new CatalogError('Informe o frete cobrado ao cliente em USD, inclusive zero confirmado.',422);
 const asin=String(product.asin||'');if(asin&&!/^[A-Z0-9]{10}$/.test(asin))throw new CatalogError('ASIN inválido para tarifas.');
 const target={sku,seller_id:config.sellerId,marketplace_id:config.marketplaceId,id_type:asin?'ASIN' as const:'SellerSKU' as const,id_value:asin||sku,price,shipping_charge:shipping,fulfillment:product.fulfillment as 'FBM'|'FBA',currency:'USD' as const};
 return {...target,request_identifier:hash(target).slice(0,32)};
}
function amount(value:any):number{
 if(!value||value.CurrencyCode!=='USD'||typeof value.Amount!=='number'||!Number.isFinite(value.Amount)||value.Amount<0||!Number.isSafeInteger(Math.round(value.Amount*100)))throw new CatalogError('Amazon retornou valor de tarifa/moeda não reconhecido.',502);
 return value.Amount;
}
function detail(value:any,depth=0):{type:string;final_fee:number;tax_amount:number|null;included:unknown[]}{
 if(depth>3||typeof value?.FeeType!=='string'||!value.FeeType||value.FeeType.length>100)throw new CatalogError('Detalhamento de tarifas inválido.',502);
 amount(value.FeeAmount);if(value.FeePromotion!==undefined)amount(value.FeePromotion);
 const children=value.IncludedFeeDetailList||[];if(!Array.isArray(children)||children.length>64)throw new CatalogError('Detalhamento de tarifas excede o contrato.',502);
 return {type:value.FeeType,final_fee:amount(value.FinalFee),tax_amount:value.TaxAmount===undefined?null:amount(value.TaxAmount),included:children.map(child=>detail(child,depth+1))};
}
export function normalizeAmazonFeeEstimate(response:any,target:AmazonFeeTarget,now=Date.now()):AmazonFeeEstimate{
 const result=response?.payload?.FeesEstimateResult;
 if(result?.Status!=='Success')throw new CatalogError('Amazon não comprovou uma estimativa de tarifas bem-sucedida.',502);
 const identity=result.FeesEstimateIdentifier,prices=identity?.PriceToEstimateFees;
 if(identity?.MarketplaceId!==target.marketplace_id||identity?.SellerId!==target.seller_id||identity?.IdType!==target.id_type||identity?.IdValue!==target.id_value||identity?.SellerInputIdentifier!==target.request_identifier||identity?.IsAmazonFulfilled!==(target.fulfillment==='FBA')||amount(prices?.ListingPrice)!==target.price)throw new CatalogError('Estimativa não corresponde à conta, identidade, preço ou fulfillment solicitado.',502);
 if(prices.Shipping===undefined?target.shipping_charge!==0:amount(prices.Shipping)!==target.shipping_charge)throw new CatalogError('Estimativa não comprova o frete cobrado ao cliente.',502);
 const estimate=result.FeesEstimate,time=typeof estimate?.TimeOfFeesEstimation==='string'?Date.parse(estimate.TimeOfFeesEstimation):NaN;
 if(!Number.isFinite(time)||time>now+300000||now-time>86400000)throw new CatalogError('Data da estimativa inválida ou vencida; consulte novamente.',502);
 const entries=estimate.FeeDetailList||[];if(!Array.isArray(entries)||entries.length>64)throw new CatalogError('Lista de tarifas inválida.',502);
 const normalized={version:1 as const,kind:'estimate' as const,source:'amazon_product_fees_api' as const,channel:'amazon-us' as const,target,checked_at:new Date(now).toISOString(),estimated_at:new Date(time).toISOString(),expires_at:new Date(Math.min(now,time)+86400000).toISOString(),total_fees:amount(estimate.TotalFeesEstimate),details:entries.map(entry=>detail(entry))};
 // TotalFeesEstimate is authoritative for this estimate; nested details are never added twice.
 return {...normalized,snapshot_hash:hash(normalized)};
}
export function currentAmazonFeeEstimate(product:ProductInput,config:{sellerId:string;marketplaceId:string},now=Date.now()):AmazonFeeEstimate{
 const snapshot=product.amazon_fees as AmazonFeeEstimate|undefined;
 if(!snapshot||snapshot.version!==1||snapshot.kind!=='estimate'||snapshot.source!=='amazon_product_fees_api')throw new CatalogError('Consulte as tarifas Amazon para criar uma estimativa comprovada.',422);
 const target=amazonFeeTarget(product,config),{snapshot_hash,...sealed}=snapshot;
 if(snapshot_hash!==hash(sealed)||hash(snapshot.target)!==hash(target))throw new CatalogError('Conta, preço, identidade, fulfillment ou frete mudou. Consulte tarifas novamente.',409);
 if(!Number.isFinite(Date.parse(snapshot.expires_at))||!Number.isFinite(Date.parse(snapshot.checked_at))||!Number.isFinite(Date.parse(snapshot.estimated_at))||Date.parse(snapshot.expires_at)<=now||Date.parse(snapshot.checked_at)>now+300000)throw new CatalogError('Estimativa vencida ou sem data válida. Consulte tarifas novamente.',422);
 return snapshot;
}
