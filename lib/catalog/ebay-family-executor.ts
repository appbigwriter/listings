import type {SupabaseClient} from '@supabase/supabase-js';
import {hasCapability,type AuthContext} from '../auth';
import {prepareEbayFamily} from './ebay-family';
import {assertEbayAccount,ebayConfig,ebayRequest,EbayError} from '../marketplaces/ebay';
import {assertBusinessPreparation,expectedFieldsMatch} from './ebay-executor';
import {CatalogError,scopeQuery,loadProduct,persistProduct} from './repository';
import {contentHash} from './model';
import {assertRecoveryReleased} from '../operations/recovery';
import {traceSnapshot,traceHash,withTrace} from '../operations/trace';
const numericId=(value:unknown):value is string=>typeof value==='string'&&/^\d{1,64}$/.test(value);
async function absent(path:string){try{return await ebayRequest(path);}catch(error){if(error instanceof EbayError&&error.status===404)return null;throw error;}}
async function checkpoint(db:any,auth:AuthContext,claim:any,status:string,response:Record<string,unknown>){
 const result=await db.rpc('checkpoint_ebay_family_submission',{p_owner:auth.userId,p_organization:auth.organizationId,p_id:claim.id,p_expected_version:claim.updated_at,p_status:status,p_response:{...response,trace:traceSnapshot()}});
 if(result.error||typeof result.data!=='string')throw new CatalogError('Checkpoint da família não confirmado. Não repita o envio; reconcilie a conta.',503);
 claim.updated_at=result.data;claim.status=status;return result.data;
}
export function submitEbayFamily(db:SupabaseClient,auth:AuthContext,body:Record<string,unknown>){return withTrace('ebay.family.submit',{sku_hash:traceHash(String(body.sku||''))},async()=>{
 assertRecoveryReleased();
 if(!hasCapability(auth,'publish')||body.confirm!==true||process.env.PRELISTING_ENABLE_PUBLICATION!=='true'||process.env.PRELISTING_ENABLE_EBAY_PUBLICATION!=='true'||process.env.PRELISTING_ENABLE_EBAY_FAMILY_PUBLICATION!=='true')throw new CatalogError('Publicação de famílias eBay desabilitada ou não autorizada.',403);
 const prepared=await prepareEbayFamily(db,auth,String(body.sku));
 if(body.expected_hash!==prepared.request_hash||!prepared.guard.ready)throw new CatalogError('Revise todos os membros e a versão atual da família.',422);
 await assertBusinessPreparation(prepared.members[0]);
 // This is the initial flow only. Never replace another group's membership or an existing SKU.
 if(await absent(`/sell/inventory/v1/inventory_item_group/${encodeURIComponent(prepared.groupKey)}`))throw new CatalogError('O grupo já existe. Investigue a conta antes de criar/substituir membros.',409);
 for(const member of prepared.members){
  const inventory=await absent(`/sell/inventory/v1/inventory_item/${encodeURIComponent(member.sku)}`),offers=await absent(`/sell/inventory/v1/offer?sku=${encodeURIComponent(member.sku)}&marketplace_id=EBAY_US&limit=1`);
  if(inventory||offers&&(!Array.isArray(offers.offers)||offers.total!==0||offers.offers.length!==0))throw new CatalogError('Algum membro existe ou a ausência de ofertas não foi comprovada.',409);
 }
 const manifest=[prepared.manifest.parent,...prepared.manifest.members],target={account_id:prepared.target.seller_id,marketplace_id:'EBAY_US',manifest_hash:prepared.request_hash};
 const reserved=await db.rpc('reserve_ebay_family_submission',{p_owner:auth.userId,p_organization:auth.organizationId,p_parent_sku:prepared.groupKey,p_manifest:manifest,p_payload:{group:prepared.group,members:prepared.members},p_target:target});
 if(reserved.error||!reserved.data)throw new CatalogError('Família alterada, já reservada ou com envio incerto. Reconcilie antes de tentar novamente.',409);
 const found=await scopeQuery(db.from('catalog_submissions').select('*'),auth).eq('id',reserved.data).maybeSingle();if(found.error||!found.data)throw new CatalogError('Reserva persistida, mas sem checkpoint legível. Não reenvie.',503);
 const claim=found.data,offers:Record<string,string>={};let stage='reserved',listingId:string|null=null;
 try{
  for(const member of prepared.members){
   stage='inventory_request_started';await checkpoint(db,auth,claim,'submitting',{stage,offers,listing_id:listingId});
   await ebayRequest(`/sell/inventory/v1/inventory_item/${encodeURIComponent(member.sku)}`,'PUT',member.inventory);
  }
  stage='group_request_started';await checkpoint(db,auth,claim,'submitting',{stage,offers,listing_id:listingId});
  await ebayRequest(`/sell/inventory/v1/inventory_item_group/${encodeURIComponent(prepared.groupKey)}`,'PUT',prepared.group);
  for(const member of prepared.members){
   stage='offer_request_started';await checkpoint(db,auth,claim,'submitting',{stage,offers,listing_id:listingId});
   const result=await ebayRequest('/sell/inventory/v1/offer','POST',member.offer);if(!numericId(result.offerId))throw new CatalogError('offerId não confirmado; investigue sem criar outra oferta.',503);offers[member.sku]=result.offerId;
  }
  stage='publish_request_started';await checkpoint(db,auth,claim,'submitting',{stage,offers,listing_id:listingId});
  const result=await ebayRequest('/sell/inventory/v1/offer/publish_by_inventory_item_group','POST',{inventoryItemGroupKey:prepared.groupKey,marketplaceId:'EBAY_US'});
  if(!numericId(result.listingId))throw new CatalogError('listingId da família não confirmado. Reconcilie sem repetir a publicação.',503);listingId=result.listingId;
  stage='publish_response_received';await checkpoint(db,auth,claim,'accepted',{stage,offers,listing_id:listingId});
  return {id:claim.id,status:'accepted',listing_id:listingId,message:'Resposta recebida; consulte o grupo e cada variante para comprovar a publicação.'};
 }catch(error){try{await checkpoint(db,auth,claim,'unknown',{stage,offers,listing_id:listingId});}catch{/* Durable claims remain blocking even when checkpoint acknowledgement fails. */}throw error;}
});}
export function monitorEbayFamily(db:SupabaseClient,auth:AuthContext,sku:string,beforePersist?:()=>Promise<void>){return withTrace('ebay.family.monitor',{sku_hash:traceHash(sku)},async()=>{
 const found=await scopeQuery(db.from('catalog_submissions').select('*'),auth).eq('sku',sku).eq('channel','ebay-us').eq('target->>operation','family_group').order('created_at',{ascending:false}).limit(1).maybeSingle();
 if(found.error||!found.data)throw new CatalogError('Envio de família eBay não encontrado.',404);
 const claim=found.data,config=ebayConfig();
 if(claim.target?.account_id!==config.accountId||claim.target?.marketplace_id!=='EBAY_US')throw new CatalogError('Família pertence a outra conta.',409);
 if(claim.status==='submitting'&&Date.now()-Date.parse(claim.updated_at)<180000)throw new CatalogError('Família ainda pode estar em execução. Aguarde.',409);
 await assertEbayAccount();
 const group=await ebayRequest(`/sell/inventory/v1/inventory_item_group/${encodeURIComponent(sku)}`),expected=claim.request_payload;
 if(group?.inventoryItemGroupKey!==sku||!expected?.group||!Array.isArray(expected.members)||!expected.members.length||!expectedFieldsMatch(expected.group,group))return {matched:false,status:claim.status,message:'Grupo não comprova a versão enviada. Não reenvie.'};
 const offers:Record<string,string>={...claim.response?.offers};let listingId:string|undefined;
 const durable=await scopeQuery(db.from('catalog_submissions').select('sku,request_hash,response'),auth).eq('target->>family_id',claim.id).neq('id',claim.id);
 if(durable.error||durable.data?.length!==expected.members.length)throw new CatalogError('Checkpoints de variantes incompletos; investigue a família.',503);
 for(const row of durable.data)if(!offers[row.sku]&&numericId(row.response?.offer_id))offers[row.sku]=row.response.offer_id;
 for(const member of expected.members){
  await beforePersist?.();
  if(!numericId(offers[member.sku]))throw new CatalogError('Há offerId de variante não confirmado. Recupere IDs com evidência antes de continuar.',409);
  const inventory=await ebayRequest(`/sell/inventory/v1/inventory_item/${encodeURIComponent(member.sku)}`),offer=await ebayRequest(`/sell/inventory/v1/offer/${offers[member.sku]}`);
  if(inventory?.sku!==member.sku||offer?.offerId!==offers[member.sku]||!expectedFieldsMatch(member.inventory,inventory)||!expectedFieldsMatch(member.offer,offer)||offer.sku!==member.sku||offer.marketplaceId!=='EBAY_US'||offer.status!=='PUBLISHED'||!numericId(offer.listing?.listingId)||listingId&&listingId!==offer.listing.listingId||claim.response?.listing_id&&claim.response.listing_id!==offer.listing.listingId)return {matched:false,status:claim.status,message:'Alguma variante não comprova a mesma publicação. Não reenvie.'};
  listingId=offer.listing.listingId;
 }
 await beforePersist?.();await checkpoint(db,auth,claim,'published',{...claim.response,stage:'readback_verified',offers,listing_id:listingId});
 const versions=await scopeQuery(db.from('catalog_submissions').select('sku,request_hash,created_at'),auth).eq('target->>family_id',claim.id);
 if(versions.error||versions.data?.length!==expected.members.length+1)throw new CatalogError('Ledger reconciliado; projeções da família precisam de investigação.',503);
 const outcomes=[];
 for(const version of versions.data){const loaded=await loadProduct(db,auth,version.sku),current=contentHash(loaded.product,'ebay-us')===version.request_hash;if(current){loaded.product._catalog!.channels['ebay-us']!.submission={status:'published',publication_status:version.sku===sku?'family_content_verified':'published_verified',request_hash:version.request_hash,submitted_at:version.created_at,verified_at:new Date().toISOString(),verified_content_hash:version.request_hash,response:{family_id:claim.id,listing_id:listingId,...(offers[version.sku]?{offer_id:offers[version.sku]}:{})},trace:traceSnapshot()};await beforePersist?.();await persistProduct(db,auth,loaded.product,loaded.row);}outcomes.push({sku:version.sku,current_version_verified:current});}
 return {matched:true,status:'published',listing_id:listingId,outcomes};
});}
