import type {SupabaseClient} from '@supabase/supabase-js';
import {hasCapability,type AuthContext} from '../auth';
import {assertEbayAccount,ebayConfig,ebayRequest,EbayError} from '../marketplaces/ebay';
import {buildEbayPackage} from '../marketplaces/ebay-package';
import {contentHash,hash} from './model';
import {evaluateReadiness} from './readiness';
import {CatalogError,loadProduct,persistProduct,scopeQuery} from './repository';

export function expectedFieldsMatch(expected:unknown,actual:unknown):boolean {
 if(Array.isArray(expected))return Array.isArray(actual)&&expected.length===actual.length&&expected.every((value,index)=>expectedFieldsMatch(value,actual[index]));
 if(expected&&typeof expected==='object')return Boolean(actual&&typeof actual==='object'&&!Array.isArray(actual)&&Object.entries(expected).every(([key,value])=>Object.hasOwn(actual,key)&&expectedFieldsMatch(value,(actual as Record<string,unknown>)[key])));
 return expected===actual;
}
async function absentOnly(path:string) {try{return await ebayRequest(path);}catch(error){if(error instanceof EbayError&&error.status===404)return null;throw error;}}
export async function prepareEbay(db:SupabaseClient,auth:AuthContext,sku:string) {
 const loaded=await loadProduct(db,auth,sku);if(!evaluateReadiness(loaded.product,'ebay-us').ready)throw new CatalogError('Resolva as pendências e aprove esta versão eBay.',422);
 if(sku.length>50)throw new CatalogError('SKU eBay excede 50 caracteres.',422);
 const pack=buildEbayPackage(loaded.product),target={...await assertEbayAccount(),operation:'initial_standalone_publish'};
 return {sku,updated_at:loaded.row.updated_at,content_hash:contentHash(loaded.product,'ebay-us'),target,inventory:pack.inventory,offer:pack.offer,request_hash:hash({sku,updated_at:loaded.row.updated_at,content_hash:contentHash(loaded.product,'ebay-us'),target,inventory:pack.inventory,offer:pack.offer})};
}
async function assertBusinessPreparation(prepared:Awaited<ReturnType<typeof prepareEbay>>) {
 const policies=prepared.offer.listingPolicies;
 const [payment,returns,fulfillment,location,conditions]=await Promise.all([
  ebayRequest(`/sell/account/v1/payment_policy/${encodeURIComponent(policies.paymentPolicyId)}`),
  ebayRequest(`/sell/account/v1/return_policy/${encodeURIComponent(policies.returnPolicyId)}`),
  ebayRequest(`/sell/account/v1/fulfillment_policy/${encodeURIComponent(policies.fulfillmentPolicyId)}`),
  ebayRequest(`/sell/inventory/v1/location/${encodeURIComponent(prepared.offer.merchantLocationKey)}`),
  ebayRequest(`/sell/metadata/v1/marketplace/EBAY_US/get_item_condition_policies?filter=${encodeURIComponent(`categoryIds:{${prepared.offer.categoryId}}`)}`)
 ]);
 if(payment.paymentPolicyId!==policies.paymentPolicyId||returns.returnPolicyId!==policies.returnPolicyId||fulfillment.fulfillmentPolicyId!==policies.fulfillmentPolicyId||[payment,returns,fulfillment].some(policy=>policy.marketplaceId!=='EBAY_US')||location.merchantLocationKey!==prepared.offer.merchantLocationKey||location.merchantLocationStatus!=='ENABLED')throw new CatalogError('Policies/localização não correspondem à conta eBay US selecionada.',422);
 const condition=conditions.itemConditionPolicies?.find((policy:any)=>policy.categoryId===prepared.offer.categoryId);
 if(!condition?.itemConditions?.some((item:any)=>String(item.conditionId)==='1000'))throw new CatalogError('A condição NEW não foi comprovada na categoria eBay.',422);
}
export async function submitEbay(db:SupabaseClient,auth:AuthContext,body:Record<string,unknown>) {
 if(!hasCapability(auth,'publish')||process.env.PRELISTING_ENABLE_PUBLICATION!=='true'||process.env.PRELISTING_ENABLE_EBAY_PUBLICATION!=='true'||body.confirm!==true)throw new CatalogError('Publicação eBay desabilitada ou não autorizada.',403);
 const prepared=await prepareEbay(db,auth,String(body.sku));if(body.expected_hash!==prepared.request_hash)throw new CatalogError('A versão/conta eBay mudou. Prepare e revise novamente.',409);
 await assertBusinessPreparation(prepared);
 const [inventory,offers]=await Promise.all([absentOnly(`/sell/inventory/v1/inventory_item/${encodeURIComponent(prepared.sku)}`),absentOnly(`/sell/inventory/v1/offer?sku=${encodeURIComponent(prepared.sku)}&marketplace_id=EBAY_US&limit=1`)]);
 if(offers!==null&&(!Array.isArray(offers.offers)||!Number.isSafeInteger(offers.total)||offers.total<0))throw new CatalogError('Resposta de ofertas não comprova ausência; consulte a conta antes de enviar.',503);
 if(inventory||offers?.offers?.length||Number(offers?.total||0)>0)throw new CatalogError('Este SKU já existe no eBay. O fluxo inicial não substitui inventário/ofertas existentes.',409);
 const reserved=await db.rpc('reserve_catalog_channel_submission',{p_owner:auth.userId,p_organization:auth.organizationId,p_sku:prepared.sku,p_channel:'ebay-us',p_version:prepared.updated_at,p_hash:prepared.content_hash,p_payload:{inventory:prepared.inventory,offer:prepared.offer},p_target:prepared.target});
 if(reserved.error||!reserved.data)throw new CatalogError('Versão alterada, já reservada ou envio eBay incerto. Investigue antes de reenviar.',409);
 const id=reserved.data;let stage='reserved',offerId:string|undefined,listingId:string|undefined;
 const save=async(status:string)=>{
  const saved=await scopeQuery(db.from('catalog_submissions').update({status,response:{stage,offer_id:offerId||null,listing_id:listingId||null},updated_at:new Date().toISOString()}),auth).eq('id',id).eq('status','submitting').select('id').maybeSingle();
  if(saved.error||!saved.data)throw new CatalogError('Falha no checkpoint eBay. Não repita a publicação.',503);
 };
 try {
  stage='inventory_request_started';await save('submitting');await ebayRequest(`/sell/inventory/v1/inventory_item/${encodeURIComponent(prepared.sku)}`,'PUT',prepared.inventory);
  stage='offer_request_started';await save('submitting');const created=await ebayRequest('/sell/inventory/v1/offer','POST',prepared.offer);
  if(typeof created.offerId!=='string'||!/^\d{1,64}$/.test(created.offerId))throw new Error('eBay não retornou offerId válido.');offerId=created.offerId;
  stage='publish_request_started';await save('submitting');const published=await ebayRequest(`/sell/inventory/v1/offer/${encodeURIComponent(offerId!)}/publish`,'POST');
  if(typeof published.listingId!=='string'||!/^\d{1,64}$/.test(published.listingId))throw new Error('eBay não retornou listingId válido.');listingId=published.listingId;
  stage='publish_response_received';await save('accepted');return {id,status:'accepted',offer_id:offerId,listing_id:listingId,message:'Resposta recebida; consulte a situação para comprovar o conteúdo publicado.'};
 }catch(error) {
  await scopeQuery(db.from('catalog_submissions').update({status:'unknown',response:{stage,offer_id:offerId||null,listing_id:listingId||null,error:'external_write_unconfirmed'},updated_at:new Date().toISOString()}),auth).eq('id',id).eq('status','submitting');throw error;
 }
}
export async function monitorEbay(db:SupabaseClient,auth:AuthContext,sku:string) {
 const loaded=await loadProduct(db,auth,sku),claim=await scopeQuery(db.from('catalog_submissions').select('*'),auth).eq('sku',sku).eq('channel','ebay-us').order('created_at',{ascending:false}).limit(1).maybeSingle();
 if(claim.error||!claim.data)throw new CatalogError('Não há envio eBay registrado para este SKU.',404);
 const record=claim.data,config=ebayConfig();
 if(record.target?.account_id!==config.accountId||record.target?.marketplace_id!=='EBAY_US')throw new CatalogError('O envio pertence a outra conta eBay.',409);
 if(record.status==='submitting'&&Date.now()-Date.parse(record.created_at)<180000)throw new CatalogError('Envio eBay ainda pode estar em execução. Aguarde.',409);
 await assertEbayAccount();
 if(!record.response?.offer_id)throw new CatalogError('offerId não confirmado. Investigue a etapa registrada no ledger; não crie outra oferta automaticamente.',409);
 const [inventory,offer]=await Promise.all([ebayRequest(`/sell/inventory/v1/inventory_item/${encodeURIComponent(sku)}`),ebayRequest(`/sell/inventory/v1/offer/${encodeURIComponent(record.response.offer_id)}`)]);
 const matched=expectedFieldsMatch(record.request_payload?.inventory,inventory)&&expectedFieldsMatch(record.request_payload?.offer,offer)&&offer.sku===sku&&offer.marketplaceId==='EBAY_US'&&offer.status==='PUBLISHED'&&typeof offer.listing?.listingId==='string'&&/^\d{1,64}$/.test(offer.listing.listingId);
 if(!matched)return {data:loaded.row,output:{matched:false,message:'Readback não comprova integralmente esta versão publicada. Investigue sem reenviar.'},report:evaluateReadiness(loaded.product,'ebay-us'),content_hash:contentHash(loaded.product,'ebay-us')};
 const saved=await scopeQuery(db.from('catalog_submissions').update({status:'published',response:{...record.response,reconciled_at:new Date().toISOString(),listing_id:offer.listing.listingId},updated_at:new Date().toISOString()}),auth).eq('id',record.id).eq('status',record.status).select('id').maybeSingle();
 if(saved.error||!saved.data)throw new CatalogError('O ledger eBay mudou durante a consulta.',409);
 let data=loaded.row;
 if(contentHash(loaded.product,'ebay-us')===record.request_hash) {
  loaded.product._catalog!.channels['ebay-us']!.submission={status:'published',request_hash:record.request_hash,submitted_at:record.created_at,response:{offer_id:record.response.offer_id,listing_id:offer.listing.listingId},publication_status:'published_verified'};
  data=await persistProduct(db,auth,loaded.product,loaded.row);
 }
 return {data,output:{matched:true,status:'published',listing_id:offer.listing.listingId},report:evaluateReadiness(loaded.product,'ebay-us'),content_hash:contentHash(loaded.product,'ebay-us')};
}
