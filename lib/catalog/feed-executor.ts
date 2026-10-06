import type { SupabaseClient } from '@supabase/supabase-js';
import { hasCapability,type AuthContext } from '../auth';
import { amazonConfig } from '../marketplaces/amazon';
import { createAmazonFeedDocument,uploadAmazonFeed,createAmazonFeed,getAmazonFeed,getAmazonFeedReport } from '../marketplaces/amazon-feeds';
import { contentHash,hash } from './model';
import { CatalogError,loadProduct,scopeQuery } from './repository';
import { assertFamily } from './family';
import { buildAmazonFeed } from './feed';
import { interpretFeedReport,type FeedManifestItem } from './feed-report';
import {traceEvent,traceHash,traceSnapshot,withTrace} from '../operations/trace';
import {assertRecoveryReleased} from '../operations/recovery';

export async function prepareFeed(db:SupabaseClient,auth:AuthContext,skus:string[]) {
  if(!Array.isArray(skus)||!skus.length||skus.length>5000||new Set(skus).size!==skus.length||skus.some(sku=>typeof sku!=='string'))throw new CatalogError('Seleção de feed inválida.');
  const loaded:Awaited<ReturnType<typeof loadProduct>>[]=[];
  for(const sku of skus) {const item=await loadProduct(db,auth,sku);await assertFamily(db,auth,item.product,'amazon-us');loaded.push(item);}
  const feed=buildAmazonFeed(loaded.map(item=>item.product));
  const manifest:FeedManifestItem[]=feed.messages.map(message=>({sku:String(message.sku),hash:contentHash(loaded.find(item=>item.product.sku===message.sku)!.product),updated_at:loaded.find(item=>item.product.sku===message.sku)!.row.updated_at,message_id:message.messageId}));
  const config=amazonConfig(),target={seller_id:config.sellerId,marketplace_id:config.marketplaceId};
  return {feed,manifest,target,manifest_hash:hash({feed,manifest,target})};
}
export async function submitFeed(db:SupabaseClient,auth:AuthContext,skus:string[],expectedHash:string,confirm:boolean,retryOf?:unknown) {
  return withTrace('feed.submit',{organization_hash:traceHash(auth.organizationId),workflow_hash:expectedHash},()=>submitFeedStep(db,auth,skus,expectedHash,confirm,retryOf));
}
async function submitFeedStep(db:SupabaseClient,auth:AuthContext,skus:string[],expectedHash:string,confirm:boolean,retryOf?:unknown){
  assertRecoveryReleased();
  if(!hasCapability(auth,'publish') || process.env.PRELISTING_ENABLE_PUBLICATION!=='true' || process.env.PRELISTING_ENABLE_FEEDS!=='true' || confirm!==true)throw new CatalogError('Publicação de feeds desabilitada ou não autorizada.',403);
  if(retryOf!==undefined&&(typeof retryOf!=='string'||!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(retryOf)))throw new CatalogError('Identificador da tentativa anterior inválido.');
  const prepared=await prepareFeed(db,auth,skus);if(prepared.manifest_hash!==expectedHash)throw new CatalogError('O manifesto mudou. Prepare e revise novamente.',409);
  const reserved=await db.rpc('reserve_catalog_feed',{p_owner:auth.userId,p_organization:auth.organizationId,p_manifest_hash:expectedHash,p_manifest:prepared.manifest,p_payload:prepared.feed,p_target:prepared.target,p_retry_of:retryOf??null});
  if(reserved.error || !reserved.data)throw new CatalogError('Feed ou algum SKU já reservado, versão alterada ou submissão incerta. Consulte os lotes antes de tentar novamente.',409);
  const id=reserved.data;let externalStarted=false;
  traceEvent('feed.reserved',{feed_id:id,workflow_hash:prepared.manifest_hash,total:prepared.manifest.length});
  const save=async(values:Record<string,unknown>)=>{const result=await scopeQuery(db.from('catalog_feeds').update({...values,updated_at:new Date().toISOString()}),auth).eq('id',id);if(result.error)throw new CatalogError('Falha ao registrar o feed. Consulte o lote antes de qualquer reenvio.',503);};
  try {
    const document=await createAmazonFeedDocument();if(typeof document.feedDocumentId!=='string'||typeof document.url!=='string')throw new Error('Documento Amazon inválido.');
    await save({status:'uploading',document_id:document.feedDocumentId});
    await uploadAmazonFeed(document.url,prepared.feed);
    await save({status:'submitting'});externalStarted=true;
    const submitted=await createAmazonFeed(document.feedDocumentId);if(typeof submitted.feedId!=='string')throw new Error('Amazon não retornou feedId.');
    await save({status:'processing',feed_id:submitted.feedId,processing_status:'IN_QUEUE'});
    // Keep per-SKU reservations uncertain until the processing report resolves each message.
    return {id,feed_id:submitted.feedId,status:'processing'};
  }catch(error) {
    await scopeQuery(db.from('catalog_feeds').update({status:externalStarted?'unknown':'failed',updated_at:new Date().toISOString()}),auth).eq('id',id);
    await scopeQuery(db.from('catalog_submissions').update({status:externalStarted?'unknown':'rejected',response:{batch_id:id,error:'feed_submission_failed',external_started:externalStarted,trace:traceSnapshot()},updated_at:new Date().toISOString()}),auth).eq('feed_batch_id',id).eq('status','submitting');
    throw error;
  }
}
export async function monitorFeed(db:SupabaseClient,auth:AuthContext,id:string) {
  return withTrace('feed.monitor',{feed_id:id,organization_hash:traceHash(auth.organizationId)},()=>monitorFeedStep(db,auth,id));
}
async function monitorFeedStep(db:SupabaseClient,auth:AuthContext,id:string){
  const found=await scopeQuery(db.from('catalog_feeds').select('*'),auth).eq('id',id).maybeSingle();if(found.error||!found.data)throw new CatalogError('Feed não encontrado.',404);
  const batch=found.data,config=amazonConfig();if(batch.target.seller_id!==config.sellerId||batch.target.marketplace_id!==config.marketplaceId)throw new CatalogError('Feed pertence a outra configuração de conta.',409);
  if(['completed','cancelled'].includes(batch.status))return {id,status:batch.status,processing_status:batch.processing_status};
  if(!batch.feed_id)throw new CatalogError('Feed sem ID confirmado; investigue a submissão incerta. Não reenvie automaticamente.',409);
  if(batch.lease_until && Date.parse(batch.lease_until)>Date.now())throw new CatalogError('Outro monitor já está processando este feed.',409);
  const lease=crypto.randomUUID();
  const claimed=await scopeQuery(db.from('catalog_feeds').update({lease_token:lease,lease_until:new Date(Date.now()+180000).toISOString(),updated_at:new Date().toISOString()}),auth).eq('id',id).eq('updated_at',batch.updated_at).select('id').maybeSingle();if(claimed.error||!claimed.data)throw new CatalogError('Feed reservado por outro monitor.',409);
  const save=async(values:Record<string,unknown>)=>{const result=await scopeQuery(db.from('catalog_feeds').update({...values,updated_at:new Date().toISOString()}),auth).eq('id',id).eq('lease_token',lease).select('id').maybeSingle();if(result.error||!result.data)throw new CatalogError('Falha ao registrar processamento ou reserva expirada.',503);};
  try {
    const remote=await getAmazonFeed(batch.feed_id),status=remote.processingStatus;
    if(!['IN_QUEUE','IN_PROGRESS','DONE','FATAL','CANCELLED'].includes(status))throw new Error('Status de feed Amazon desconhecido.');
    if(status==='IN_QUEUE'||status==='IN_PROGRESS') {await save({processing_status:status,status:'processing'});return {id,status:'processing',processing_status:status};}
    let outcomes;
    let report;
    if(status==='CANCELLED')outcomes=(batch.manifest as FeedManifestItem[]).map(item=>({...item,status:'rejected',issues:[]}));
    else if(remote.resultFeedDocumentId) {report=await getAmazonFeedReport(remote.resultFeedDocumentId);outcomes=interpretFeedReport(report,batch.manifest,batch.target.seller_id,batch.feed_id);}
    else throw new CatalogError('Feed terminou sem relatório disponível. Aguarde e consulte novamente.',503);
    for(const outcome of outcomes) {
      await save({lease_until:new Date(Date.now()+180000).toISOString()});
      let expectedVersion:string|null=null,submission:Record<string,unknown>|null=null;
      try {
        const loaded=await loadProduct(db,auth,outcome.sku);
        // An old feed never overwrites the status of a newer product version.
        if(contentHash(loaded.product)===outcome.hash) {
          expectedVersion=loaded.row.updated_at;
          submission={status:outcome.status,request_hash:outcome.hash,submitted_at:batch.created_at,response:{feed_id:batch.feed_id,message_id:outcome.message_id,trace:traceSnapshot()},issues:outcome.issues,publication_status:'not_verified'};
        }
      }catch(error){if(!(error instanceof CatalogError)||error.status!==404)throw error;}
      const updated=await db.rpc('record_catalog_feed_outcome',{p_owner:auth.userId,p_organization:auth.organizationId,p_batch:id,p_lease:lease,p_sku:outcome.sku,p_hash:outcome.hash,p_status:outcome.status,p_response:{batch_id:id,feed_id:batch.feed_id,message_id:outcome.message_id,issues:outcome.issues,trace:traceSnapshot()},p_expected_version:expectedVersion,p_submission:submission});
      if(updated.error||!updated.data)throw new CatalogError('Falha ao registrar atomicamente o resultado por SKU. O próximo monitor retomará o relatório.',503);
      traceEvent('feed.item_recorded',{feed_id:id,sku_hash:traceHash(outcome.sku),content_hash:outcome.hash,state:outcome.status});
    }
    const remaining=await scopeQuery(db.from('catalog_submissions').select('id',{count:'exact',head:true}),auth).eq('feed_batch_id',id).in('status',['submitting','unknown']);
    if(remaining.error)throw new CatalogError('Falha ao verificar pendências do feed.',503);
    const unresolved=(remaining.count||0)>0;
    await save({status:unresolved?'unknown':status==='CANCELLED'?'cancelled':'completed',processing_status:status,result_document_id:remote.resultFeedDocumentId || null,report:report || null});
    return {id,status:unresolved?'unknown':'completed',processing_status:status,outcomes};
  }finally{await scopeQuery(db.from('catalog_feeds').update({lease_token:null,lease_until:null}),auth).eq('id',id).eq('lease_token',lease);}
}
export async function recoverFeedId(db:SupabaseClient,auth:AuthContext,id:string,feedId:string,evidence:string,confirm:unknown) {
  if(!hasCapability(auth,'publish')||confirm!==true)throw new CatalogError('Recuperação exige administrador e confirmação explícita.',403);
  if(!/^\d{1,64}$/.test(feedId)||typeof evidence!=='string'||evidence.trim().length<10||evidence.length>2000)throw new CatalogError('Informe o feed ID Amazon e a evidência de correspondência no Seller Central.');
  const found=await scopeQuery(db.from('catalog_feeds').select('*'),auth).eq('id',id).maybeSingle();
  if(found.error||!found.data)throw new CatalogError('Lote não encontrado.',404);
  const batch=found.data,config=amazonConfig();
  if(batch.feed_id||!['unknown','submitting'].includes(batch.status)||Date.now()-Date.parse(batch.created_at)<180000)throw new CatalogError('Este lote não permite recuperação de ID ou ainda pode estar em execução.',409);
  if(batch.target.seller_id!==config.sellerId||batch.target.marketplace_id!==config.marketplaceId)throw new CatalogError('Configuração de conta mudou.',409);
  const remote=await getAmazonFeed(feedId),created=Date.parse(remote.createdTime),local=Date.parse(batch.created_at);
  if(remote.feedId!==feedId||remote.feedType!=='JSON_LISTINGS_FEED'||!['IN_QUEUE','IN_PROGRESS','DONE','FATAL','CANCELLED'].includes(remote.processingStatus)||!Array.isArray(remote.marketplaceIds)||remote.marketplaceIds.length!==1||remote.marketplaceIds[0]!==config.marketplaceId||!Number.isFinite(created)||created<local-30000||created>local+900000)throw new CatalogError('O feed informado não corresponde ao tipo, marketplace ou janela temporal do lote.',422);
  const saved=await scopeQuery(db.from('catalog_feeds').update({feed_id:feedId,status:'processing',processing_status:remote.processingStatus,target:{...batch.target,recovery_attestation:{actor:auth.userId,at:new Date().toISOString(),evidence:evidence.trim(),manifest_hash:batch.manifest_hash}},updated_at:new Date().toISOString()}),auth).eq('id',id).eq('updated_at',batch.updated_at).is('feed_id',null).select('id').maybeSingle();
  if(saved.error||!saved.data)throw new CatalogError('Lote mudou durante a recuperação.',409);
  return {id,feed_id:feedId,status:'processing',identity:'administrator_attested',message:'A evidência do administrador identifica o lote; o relatório ainda precisa resolver cada SKU.'};
}
