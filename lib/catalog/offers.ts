import type { SupabaseClient } from '@supabase/supabase-js';
import { hasCapability,type AuthContext } from '../auth';
import { amazonConfig,amazonRequest,amazonReadback } from '../marketplaces/amazon';
import { contentHash,hash,type ProductInput } from './model';
import { evaluateReadiness } from './readiness';
import { CatalogError,loadProduct,scopeQuery,persistProduct } from './repository';
import {assertOfferAuthority,recordOfferAuthority,offerFields} from './offer-authority';
import {isNumericInput} from './numeric-input';

export function offerPatch(product:ProductInput,fields:unknown,authority:unknown) {
  const selected=offerFields(fields);
  if(authority!=='prelisting')throw new CatalogError('Confirme que o PreListing é a fonte autorizada destes valores.',422);
  if(product.relationship==='Parent')throw new CatalogError('SKU pai não possui oferta.',422);
  const patches=[];
  const attributes:Record<string,unknown>={};
  if(selected.includes('price')) {
    const price=Number(product.price);if(!isNumericInput(product.price)||price<=0||!Number.isSafeInteger(Math.round(price*100))||Math.abs(price*100-Math.round(price*100))>0.00001)throw new CatalogError('Preço deve ser positivo e ter até duas casas decimais.');
    attributes.purchasable_offer=[{marketplace_id:amazonConfig().marketplaceId,currency:'USD',audience:'ALL',our_price:[{schedule:[{value_with_tax:price}]}]}];
    patches.push({op:'merge',path:'/attributes/purchasable_offer',value:attributes.purchasable_offer});
  }
  if(selected.includes('qty')) {
    if(product.fulfillment!=='FBM')throw new CatalogError('Estoque FBA é controlado pela Amazon; este PATCH aceita somente FBM.',422);
    const qty=Number(product.qty);if(!isNumericInput(product.qty)||!Number.isSafeInteger(qty)||qty<0)throw new CatalogError('Estoque deve ser um inteiro não negativo.');
    attributes.fulfillment_availability=[{fulfillment_channel_code:'DEFAULT',quantity:qty}];
    patches.push({op:'merge',path:'/attributes/fulfillment_availability',value:attributes.fulfillment_availability});
  }
  return {payload:{productType:product._catalog?.channels['amazon-us']?.product_type,patches},attributes};
}
export async function prepareOffer(db:SupabaseClient,auth:AuthContext,sku:string,fields:unknown,authority:unknown) {
  const loaded=await loadProduct(db,auth,sku);
  if(!evaluateReadiness(loaded.product,'amazon-us').ready)throw new CatalogError('Revise e aprove a versão antes de atualizar a oferta.',422);
  if(!/^[A-Z0-9]{10}$/.test(String(loaded.product.asin||'')))throw new CatalogError('Confirme o ASIN existente antes de atualizar a oferta.',422);
  const patch=offerPatch(loaded.product,fields,authority),config=amazonConfig(),policy=assertOfferAuthority(loaded.product,auth,config,fields);
  const target={seller_id:config.sellerId,marketplace_id:config.marketplaceId,asin:String(loaded.product.asin),operation:'offer_patch',authority:'prelisting',authority_record_hash:policy.record_hash,authority_expires_at:policy.expires_at};
  return {sku,updated_at:loaded.row.updated_at,content_hash:contentHash(loaded.product),...patch,target,request_hash:hash({sku,version:loaded.row.updated_at,content_hash:contentHash(loaded.product),payload:patch.payload,target})};
}
export async function saveOfferAuthority(db:SupabaseClient,auth:AuthContext,body:Record<string,unknown>){
 if(!hasCapability(auth,'publish'))throw new CatalogError('Seu papel não permite definir a autoridade da oferta.',403);
 const loaded=await loadProduct(db,auth,String(body.sku||''));
 if(body.confirm!==true||body.expected_version!==loaded.row.updated_at)throw new CatalogError('Confira a versão atual e confirme a decisão de autoridade.',409);
 if(typeof body.enabled!=='boolean')throw new CatalogError('Informe habilitação ou pausa da autoridade.');
 if(body.enabled){if(!evaluateReadiness(loaded.product,'amazon-us').ready)throw new CatalogError('Revise e aprove o produto antes de autorizar seus valores.',422);offerPatch(loaded.product,body.fields,'prelisting');}
 const product=structuredClone(loaded.product),listing=product._catalog?.channels['amazon-us'];if(!listing)throw new CatalogError('Preparação Amazon ausente.',422);
 listing.offer_authority=recordOfferAuthority(product,auth,amazonConfig(),body.fields,{enabled:body.enabled,reason:body.reason,expires_hours:body.expires_hours});
 const data=await persistProduct(db,auth,product,loaded.row);return {updated_at:data.updated_at,authority:listing.offer_authority};
}
export async function submitOffer(db:SupabaseClient,auth:AuthContext,body:Record<string,unknown>) {
  if(!hasCapability(auth,'publish')||process.env.PRELISTING_ENABLE_PUBLICATION!=='true'||process.env.PRELISTING_ENABLE_OFFER_PATCH!=='true'||body.confirm!==true)throw new CatalogError('Atualização de oferta desabilitada ou não autorizada.',403);
  const prepared=await prepareOffer(db,auth,String(body.sku),body.fields,body.authority);
  if(body.expected_hash!==prepared.request_hash)throw new CatalogError('Oferta ou versão mudou. Revise novamente.',409);
  const remote=await amazonReadback(prepared.sku);
  if(remote.sku!==prepared.sku||!remote.summaries?.some((summary:{marketplaceId?:string;asin?:string})=>summary.marketplaceId===prepared.target.marketplace_id&&summary.asin===prepared.target.asin))throw new CatalogError('SKU, marketplace e ASIN existentes não correspondem ao manifesto. Confirme a identidade antes de atualizar a oferta.',422);
  if(Date.parse(prepared.target.authority_expires_at)<=Date.now())throw new CatalogError('Autoridade venceu durante a consulta. Registre uma nova decisão antes do envio.',422);
  const claim=await db.rpc('reserve_catalog_channel_submission',{p_owner:auth.userId,p_organization:auth.organizationId,p_sku:prepared.sku,p_channel:'amazon-us',p_version:prepared.updated_at,p_hash:prepared.request_hash,p_payload:{productType:prepared.payload.productType,attributes:prepared.attributes},p_target:prepared.target});
  if(claim.error||!claim.data)throw new CatalogError('Oferta mudou, já reservada ou SKU tem submissão incerta. Reconcilie antes de reenviar.',409);
  try {
    const response=await amazonRequest(`/listings/2021-08-01/items/${encodeURIComponent(prepared.target.seller_id)}/${encodeURIComponent(prepared.sku)}`,{marketplaceIds:prepared.target.marketplace_id,issueLocale:'en_US'},'PATCH',prepared.payload);
    if(!['ACCEPTED','INVALID'].includes(response?.status))throw new CatalogError('Resposta Amazon sem resultado comprovado. Reconcilie antes de reenviar.',503);
    const status=response.status==='ACCEPTED'?'accepted':'rejected';
    const saved=await scopeQuery(db.from('catalog_submissions').update({status,response:{operation:'offer_patch',response},updated_at:new Date().toISOString()}),auth).eq('id',claim.data).eq('status','submitting').select('id').maybeSingle();
    if(saved.error||!saved.data)throw new CatalogError('Oferta enviada sem confirmação persistida. Consulte a Amazon antes de reenviar.',503);
    return {id:claim.data,status,response};
  }catch(error){await scopeQuery(db.from('catalog_submissions').update({status:'unknown',updated_at:new Date().toISOString()}),auth).eq('id',claim.data).eq('status','submitting');throw error;}
}
