import type {SupabaseClient} from '@supabase/supabase-js';
import {hasCapability,type AuthContext} from '../auth';
import {CatalogError,loadProduct,scopeQuery} from './repository';
import {assertEbayAccount,ebayConfig,ebayRequest} from '../marketplaces/ebay';
import {expectedFieldsMatch} from './ebay-executor';
import {traceSnapshot,traceHash,withTrace} from '../operations/trace';
async function recoveryClaim(db:SupabaseClient,auth:AuthContext,sku:string){
 if(!hasCapability(auth,'publish'))throw new CatalogError('Recuperação de identidade eBay exige administrador.',403);
 await loadProduct(db,auth,sku);
 const found=await scopeQuery(db.from('catalog_submissions').select('*'),auth).eq('sku',sku).eq('channel','ebay-us').order('created_at',{ascending:false}).limit(1).maybeSingle();
 if(found.error)throw new CatalogError('Não foi possível consultar o ledger eBay.',503);
 const record=found.data;if(!record)throw new CatalogError('Envio eBay não encontrado.',404);
 if(record.status!=='unknown'||record.response?.offer_id)throw new CatalogError('Recuperação exige envio incerto sem offerId confirmado.',409);
 if(!['offer_request_started','publish_request_started'].includes(record.response?.stage))throw new CatalogError('O ledger não comprova uma etapa de criação/publicação de oferta. Investigue sem associar outra oferta.',409);
 const time=Date.parse(record.created_at);if(!Number.isFinite(time)||Date.now()-time<180000)throw new CatalogError('Aguarde o término possível do envio antes de investigar sua identidade.',409);
 const config=ebayConfig();if(record.target?.account_id!==config.accountId||record.target?.marketplace_id!=='EBAY_US')throw new CatalogError('Ledger pertence a outra conta/marketplace eBay.',409);
 if(!record.request_payload?.inventory||!record.request_payload?.offer)throw new CatalogError('Snapshot original do envio ausente.',409);
 await assertEbayAccount();return record;
}
function offerMatches(record:any,sku:string,offer:any){return offer?.sku===sku&&offer?.marketplaceId==='EBAY_US'&&['PUBLISHED','UNPUBLISHED'].includes(offer?.status)&&expectedFieldsMatch(record.request_payload.offer,offer);}
export async function ebayRecoveryCandidates(db:SupabaseClient,auth:AuthContext,sku:string){
 return withTrace('ebay.recovery_candidates',{sku_hash:traceHash(sku)},async()=>{
  const record=await recoveryClaim(db,auth,sku),query=new URLSearchParams({sku,marketplace_id:'EBAY_US',format:'FIXED_PRICE',limit:'50',offset:'0'});
  const [inventory,result]=await Promise.all([ebayRequest(`/sell/inventory/v1/inventory_item/${encodeURIComponent(sku)}`),ebayRequest('/sell/inventory/v1/offer?'+query)]);
  if(inventory?.sku!==sku||!expectedFieldsMatch(record.request_payload.inventory,inventory))throw new CatalogError('Inventário remoto diverge do SKU/snapshot original. Investigue a versão e a gestão exclusiva do SKU.',422);
  if(!Array.isArray(result?.offers)||!Number.isSafeInteger(result.total)||result.total<result.offers.length||result.offers.length>50)throw new CatalogError('Consulta de ofertas fora do contrato esperado.',502);
  if(result.next||result.total>result.offers.length)throw new CatalogError('Consulta incompleta de ofertas. Investigue a população da conta antes de associar um ID.',413);
  const candidates=result.offers.filter((offer:any)=>typeof offer?.offerId==='string'&&/^\d{1,64}$/.test(offer.offerId)&&offerMatches(record,sku,offer)).map((offer:any)=>({offer_id:offer.offerId,status:offer.status,listing_id:offer.listing?.listingId||null}));
  if(new Set(candidates.map((offer:any)=>offer.offer_id)).size!==candidates.length)throw new CatalogError('Consulta retornou identidades duplicadas.',502);
  return {claim_id:record.id,expected_version:record.updated_at,sku,candidates,request_snapshot:record.request_payload,target:{account_id:record.target.account_id,marketplace_id:record.target.marketplace_id},ownership:'administrator_attestation_required',publication:'not_changed'};
 });
}
export async function recoverEbayOffer(db:SupabaseClient,auth:AuthContext,body:Record<string,unknown>){
 return withTrace('ebay.recover_offer',{sku_hash:traceHash(String(body.sku||''))},async()=>{
  if(!hasCapability(auth,'publish')||body.confirm!==true)throw new CatalogError('Confirme a associação da oferta com papel de administrador.',403);
  const offerId=String(body.offer_id||''),reason=typeof body.evidence==='string'?body.evidence.trim():'';
  if(!/^\d{1,64}$/.test(offerId)||reason.length<10||reason.length>2000)throw new CatalogError('Informe offerId e evidência da gestão exclusiva e da correspondência ao envio original.');
  const sku=String(body.sku||''),record=await recoveryClaim(db,auth,sku);
  if(body.claim_id!==record.id||body.expected_version!==record.updated_at)throw new CatalogError('O ledger mudou. Consulte candidatos novamente.',409);
  const [inventory,offer]=await Promise.all([ebayRequest(`/sell/inventory/v1/inventory_item/${encodeURIComponent(sku)}`),ebayRequest(`/sell/inventory/v1/offer/${encodeURIComponent(offerId)}`)]);
  if(inventory?.sku!==sku||offer?.offerId!==offerId||!offerMatches(record,sku,offer)||!expectedFieldsMatch(record.request_payload.inventory,inventory))throw new CatalogError('Conta, SKU, marketplace ou conteúdo não comprovam esta oferta. Nenhum ID foi associado.',422);
  const response={...record.response,offer_id:offerId,recovery:{actor:auth.userId,at:new Date().toISOString(),evidence:reason,observed_status:offer.status,identity:'administrator_attested'},trace:traceSnapshot()};
  const saved=await scopeQuery(db.from('catalog_submissions').update({response,updated_at:new Date().toISOString()}),auth).eq('id',record.id).eq('status','unknown').eq('updated_at',record.updated_at).select('id').maybeSingle();
  if(saved.error||!saved.data)throw new CatalogError('O ledger mudou durante a recuperação. Recarregue antes de decidir.',409);
  return {id:record.id,offer_id:offerId,status:'unknown',publication:'not_changed',message:'Identidade associada por decisão auditada. Use o readback; recuperação não publica nem autoriza replay.'};
 });
}
