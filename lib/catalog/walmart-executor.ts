import type {SupabaseClient} from '@supabase/supabase-js';
import {hasCapability,type AuthContext} from '../auth';
import {buildWalmartPackage} from '../marketplaces/walmart-package';
import {getWalmartFeedPage} from '../marketplaces/walmart-feed';
import {assertWalmartAccount,assertWalmartIdentity,assertWalmartSkuAbsent,postWalmartItemFeed,walmartAccountConfig,walmartPublicationEnabled} from '../marketplaces/walmart-submission';
import {contentHash,hash} from './model';
import {evaluateReadiness} from './readiness';
import {CatalogError,loadProduct,persistProduct,scopeQuery} from './repository';
import {assertRecoveryReleased} from '../operations/recovery';
import {traceSnapshot,traceHash,withTrace} from '../operations/trace';

/** One independent SKU per atomic channel claim. Multi-SKU feeds require a separate atomic reservation. */
export async function prepareWalmart(db:SupabaseClient,auth:AuthContext,sku:string){
 const loaded=await loadProduct(db,auth,sku);
 if(!evaluateReadiness(loaded.product,'walmart-us').ready)throw new CatalogError('Resolva as pendências e aprove esta versão Walmart.',422);
 const payload=buildWalmartPackage(loaded.product),target=await assertWalmartAccount(),content=contentHash(loaded.product,'walmart-us');
 if(Buffer.byteLength(JSON.stringify(payload))>target.feed_limits.max_bytes)throw new CatalogError('Feed Walmart excede o limite permitido pela conta.',422);
 return {sku,updated_at:loaded.row.updated_at,content_hash:content,target,payload,request_hash:hash({sku,updated_at:loaded.row.updated_at,content_hash:content,target,payload}),publication_enabled:walmartPublicationEnabled()};
}
export async function submitWalmart(db:SupabaseClient,auth:AuthContext,body:Record<string,unknown>){
 return withTrace('walmart.submit',{sku_hash:traceHash(String(body.sku||'')),organization_hash:traceHash(auth.organizationId)},async()=>{
  assertRecoveryReleased();
  if(!hasCapability(auth,'publish')||!walmartPublicationEnabled()||body.confirm!==true)throw new CatalogError('Publicação Walmart desabilitada ou não autorizada.',403);
  const prepared=await prepareWalmart(db,auth,String(body.sku||''));
  if(body.expected_hash!==prepared.request_hash)throw new CatalogError('Versão/conta Walmart mudou. Prepare e revise novamente.',409);
  await assertWalmartSkuAbsent(prepared.sku);
  const claim=await db.rpc('reserve_catalog_channel_submission',{p_owner:auth.userId,p_organization:auth.organizationId,p_sku:prepared.sku,p_channel:'walmart-us',p_version:prepared.updated_at,p_hash:prepared.content_hash,p_payload:prepared.payload,p_target:{...prepared.target,manifest_hash:prepared.request_hash,trace:traceSnapshot()}});
  if(claim.error||!claim.data)throw new CatalogError('Reserva Walmart não confirmada. Verifique integração da RPC, versão e envios incertos.',409);
  const id=claim.data;let stage='reserved',confirmedFeedId:string|undefined;
  const save=async(status:string,response:Record<string,unknown>)=>{
   const result=await scopeQuery(db.from('catalog_submissions').update({status,response:{...response,stage,trace:traceSnapshot()},updated_at:new Date().toISOString()}),auth).eq('id',id).eq('status','submitting').select('id').maybeSingle();
   if(result.error||!result.data)throw new CatalogError('Falha no checkpoint Walmart. Não repita o envio.',503);
  };
  try{
   stage='feed_request_started';await save('submitting',{});
   const result=await postWalmartItemFeed(prepared.payload,prepared.target);
   confirmedFeedId=result.feed_id;
   stage='feed_response_received';await save('accepted',result);
   return {id,...result,message:'Feed recebido; ingestão não comprova publicação. Consulte o processamento.'};
  }catch{
   await scopeQuery(db.from('catalog_submissions').update({status:'unknown',response:{stage,feed_id:confirmedFeedId||null,error:'external_write_unconfirmed',trace:traceSnapshot()},updated_at:new Date().toISOString()}),auth).eq('id',id).eq('status','submitting');
   throw new CatalogError('Envio Walmart incerto ou checkpoint não confirmado. Investigue sem reenviar.',503);
  }
 });
}
export async function monitorWalmart(db:SupabaseClient,auth:AuthContext,sku:string,beforePersist?:()=>Promise<void>){
 return withTrace('walmart.monitor',{sku_hash:traceHash(sku),organization_hash:traceHash(auth.organizationId)},async()=>{
  const loaded=await loadProduct(db,auth,sku);
  const claim=await scopeQuery(db.from('catalog_submissions').select('*'),auth).eq('sku',sku).eq('channel','walmart-us').order('created_at',{ascending:false}).limit(1).maybeSingle();
  if(claim.error||!claim.data)throw new CatalogError('Não há envio Walmart registrado para este SKU.',404);
  const record=claim.data,config=walmartAccountConfig();
  if(record.target?.account_id!==config.account_id||record.target?.marketplace_id!=='US'||record.target?.operation!=='walmart_mp_item')throw new CatalogError('O envio pertence a outra conta/operação Walmart.',409);
  if(record.status==='submitting'&&Date.now()-Date.parse(record.created_at)<180000)throw new CatalogError('O envio ainda pode estar em execução. Aguarde.',409);
  await assertWalmartIdentity(config);
  const feedId=record.response?.feed_id;
  if(typeof feedId!=='string')throw new CatalogError('feedId não confirmado. Investigue o histórico da conta; não crie outro feed.',409);
  const manifest=record.request_payload?.MPItem;
  if(!Array.isArray(manifest)||manifest.length!==1||manifest[0]?.Orderable?.sku!==sku)throw new CatalogError('Manifesto Walmart original não corresponde ao SKU.',409);
  const page=await getWalmartFeedPage(feedId,[sku]);
  if(!page.complete||page.next_offset!==null||page.outcomes.length!==1)return {data:loaded.row,output:{matched:false,status:'processing',publication_status:'not_verified',message:'Detalhes incompletos; preserve o ledger e consulte novamente.'}};
  const outcome=page.outcomes[0];
  const status=page.feed_status==='ERROR'?'rejected':outcome.status;
  await beforePersist?.();
  const saved=await scopeQuery(db.from('catalog_submissions').update({status,response:{...record.response,feed_status:page.feed_status,ingestion:outcome,checked_at:new Date().toISOString(),trace:traceSnapshot()},updated_at:new Date().toISOString()}),auth).eq('id',record.id).eq('status',record.status).eq('updated_at',record.updated_at).select('id').maybeSingle();
  if(saved.error||!saved.data)throw new CatalogError('O ledger Walmart mudou durante a consulta.',409);
  let data=loaded.row;
  if(contentHash(loaded.product,'walmart-us')===record.request_hash){
   const listing=loaded.product._catalog!.channels['walmart-us'];
   if(listing){listing.submission={status,request_hash:record.request_hash,submitted_at:record.created_at,publication_status:'not_verified',response:{feed_id:feedId,ingestion:outcome},trace:traceSnapshot()};await beforePersist?.();data=await persistProduct(db,auth,loaded.product,loaded.row);}
  }
  return {data,output:{matched:true,status,publication_status:'not_verified',feed_id:feedId,requires_item_readback:true}};
 });
}
/**
 * A feed receipt can be lost after an uncertain POST. This validates an
 * administrator-provided association only; it deliberately does not discover,
 * submit, or infer a published Walmart item.
 */
export function validateWalmartRecoveryInput(record:any,body:Record<string,unknown>,now=Date.now()){
 const feedId=typeof body.feed_id==='string'?body.feed_id.trim():'',evidence=typeof body.evidence==='string'?body.evidence.trim():'',observedAt=typeof body.observed_at==='string'?Date.parse(body.observed_at):NaN;
 if(!/^[A-Za-z0-9@_-]{1,200}$/.test(feedId)||evidence.length<10||evidence.length>2000||!Number.isFinite(observedAt))throw new CatalogError('Informe feedId, evidência operacional e data/hora observada.',422);
 if(record?.status!=='unknown'||record?.response?.feed_id||record?.response?.stage!=='feed_request_started')throw new CatalogError('Recuperação exige envio Walmart incerto sem feedId confirmado.',409);
 const created=Date.parse(record.created_at);if(!Number.isFinite(created)||now-created<180000||observedAt<created-300000||observedAt>now+300000)throw new CatalogError('A observação do feed não é compatível com o envio incerto.',409);
 const items=record.request_payload?.MPItem;if(!Array.isArray(items)||items.length!==1||items[0]?.Orderable?.sku!==record.sku||items[0]?.Orderable?.productIdentifiers?.productIdType!=='GTIN'||typeof items[0]?.Orderable?.productIdentifiers?.productId!=='string')throw new CatalogError('Manifesto original não comprova SKU e GTIN únicos.',409);
 return {feedId,evidence,observedAt:new Date(observedAt).toISOString(),gtin:items[0].Orderable.productIdentifiers.productId};
}
export async function recoverWalmartFeed(db:SupabaseClient,auth:AuthContext,body:Record<string,unknown>){
 return withTrace('walmart.recover_feed',{sku_hash:traceHash(String(body.sku||'')),organization_hash:traceHash(auth.organizationId)},async()=>{
  if(!hasCapability(auth,'publish')||body.confirm!==true)throw new CatalogError('Confirme a associação com papel de administrador.',403);
  const sku=String(body.sku||''),loaded=await loadProduct(db,auth,sku);
  const found=await scopeQuery(db.from('catalog_submissions').select('*'),auth).eq('sku',sku).eq('channel','walmart-us').order('created_at',{ascending:false}).limit(1).maybeSingle();
  if(found.error)throw new CatalogError('Não foi possível consultar o ledger Walmart.',503);if(!found.data)throw new CatalogError('Envio Walmart não encontrado.',404);
  const config=walmartAccountConfig(),record=found.data;
  if(record.target?.account_id!==config.account_id||record.target?.marketplace_id!=='US'||record.target?.operation!=='walmart_mp_item')throw new CatalogError('Ledger pertence a outra conta/operação Walmart.',409);
  if(body.claim_id!==record.id||body.expected_version!==record.updated_at)throw new CatalogError('O ledger mudou. Consulte novamente antes de associar o feed.',409);
  const recovery=validateWalmartRecoveryInput(record,body);await assertWalmartIdentity(config);
  const response={...record.response,feed_id:recovery.feedId,recovery:{actor:auth.userId,at:new Date().toISOString(),observed_at:recovery.observedAt,evidence:recovery.evidence,gtin:recovery.gtin,identity:'administrator_attested'},trace:traceSnapshot()};
  const saved=await scopeQuery(db.from('catalog_submissions').update({response,updated_at:new Date().toISOString()}),auth).eq('id',record.id).eq('status','unknown').eq('updated_at',record.updated_at).select('id').maybeSingle();
  if(saved.error||!saved.data)throw new CatalogError('O ledger mudou durante a recuperação. Recarregue antes de decidir.',409);
  return {id:record.id,sku:loaded.row.sku,feed_id:recovery.feedId,status:'unknown',publication_status:'not_verified',message:'Feed associado por decisão auditada. Consulte o processamento; esta ação não publica nem permite replay.'};
 });
}
