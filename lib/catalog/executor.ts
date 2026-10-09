import type { SupabaseClient } from '@supabase/supabase-js';
import { hasCapability, type AuthContext } from '../auth';
import { amazonConfig, amazonPayload, amazonReadback, amazonSubmit } from '../marketplaces/amazon';
import { applyAction } from './actions';
import { contentHash, isChannel } from './model';
import { evaluateReadiness } from './readiness';
import { CatalogError, loadProduct, persistProduct, scopeQuery } from './repository';
import { assertFamily } from './family';
import { reserveAiOperation } from '../ai/usage';
import {amazonListingObservation} from './reconciliation';
import {monitorEbay} from './ebay-executor';
import {traceEvent,traceHash,traceSnapshot,withTrace} from '../operations/trace';
import {assertRecoveryReleased} from '../operations/recovery';
import {monitorEbayFamily} from './ebay-family-executor';
import {monitorWalmart} from './walmart-executor';

export async function executeAction(db: SupabaseClient, auth: AuthContext, sku: string, action: string, options: Record<string, unknown> = {},execution:{beforePersist?:()=>Promise<void>}={}) {
  return withTrace('catalog.action',{sku_hash:traceHash(sku),organization_hash:traceHash(auth.organizationId),action},()=>executeActionStep(db,auth,sku,action,options,execution));
}
async function executeActionStep(db:SupabaseClient,auth:AuthContext,sku:string,action:string,options:Record<string,unknown>,execution:{beforePersist?:()=>Promise<void>}){
  if(action==='submit')assertRecoveryReleased();
  if (options.channel !== undefined && !isChannel(options.channel)) throw new CatalogError('Canal inválido.');
  if (action === 'review' && !hasCapability(auth, 'review') || ['submit','reconcile'].includes(action) && !hasCapability(auth, 'publish')) throw new CatalogError('Seu papel não permite esta ação.', 403);
  const loaded = await loadProduct(db, auth, sku);
  if (options.updated_at && options.updated_at !== loaded.row.updated_at) throw new CatalogError('A versão mudou. Recarregue o produto.', 409);
  const channel = isChannel(options.channel) ? options.channel : 'amazon-us';
  if(channel==='walmart-us'&&action==='monitor'){const observed=await monitorWalmart(db,auth,sku,execution.beforePersist),current=await loadProduct(db,auth,sku);return {...observed,report:evaluateReadiness(current.product,channel),content_hash:contentHash(current.product,channel)};}
  if(channel==='ebay-us'&&action==='monitor'){
    if(loaded.product.relationship==='Parent'){const output=await monitorEbayFamily(db,auth,sku,execution.beforePersist);const current=await loadProduct(db,auth,sku);return {data:current.row,output,report:evaluateReadiness(current.product,channel),content_hash:contentHash(current.product,channel)};}
    return monitorEbay(db,auth,sku,execution.beforePersist);
  }
  if (action==='reconcile') {
    if(channel!=='amazon-us')throw new CatalogError('Reconciliação disponível para Amazon.');
    const found=await scopeQuery(db.from('catalog_submissions').select('*'),auth).eq('sku',sku).eq('channel',channel).in('status',['submitting','unknown']).order('created_at',{ascending:false}).limit(1).maybeSingle();
    if(found.error || !found.data)throw new CatalogError('Não há submissão incerta para reconciliar.',404);
    const claim=found.data,config=amazonConfig();
    if(claim.feed_batch_id) {
      const feed=await scopeQuery(db.from('catalog_feeds').select('status,processing_status'),auth).eq('id',claim.feed_batch_id).maybeSingle();
      if(feed.error || !feed.data || !['DONE','FATAL','CANCELLED'].includes(feed.data.processing_status))throw new CatalogError('O feed ainda não tem término comprovado. Consulte o lote antes de reconciliar o SKU.',409);
    }
    if(claim.status==='submitting' && Date.now()-Date.parse(claim.created_at)<180000)throw new CatalogError('A submissão ainda pode estar em andamento. Aguarde antes de reconciliar.',409);
    if(claim.target?.seller_id!==config.sellerId || claim.target?.marketplace_id!==config.marketplaceId)throw new CatalogError('A submissão pertence a outra configuração de conta/marketplace.',409);
    const remote=await amazonReadback(sku);
    const proof=amazonListingObservation(claim.request_payload,sku,config.marketplaceId,remote);
    if(!proof.matched)return {data:loaded.row,output:{matched:false,message:'Readback não comprova SKU, marketplace e atributos desta versão. Reenvio permanece bloqueado.'},report:evaluateReadiness(loaded.product,channel),content_hash:contentHash(loaded.product,channel)};
    const status=proof.blocked?'rejected':proof.buyable?'published':'accepted';
    const updated=await scopeQuery(db.from('catalog_submissions').update({status,response:{reconciled_at:new Date().toISOString(),remote},updated_at:new Date().toISOString()}),auth).eq('id',claim.id).eq('status',claim.status).select('id').maybeSingle();
    if(updated.error || !updated.data)throw new CatalogError('A submissão mudou durante a reconciliação.',409);
    const listing=loaded.product._catalog!.channels[channel]!;
    const current=amazonListingObservation(amazonPayload(loaded.product),sku,config.marketplaceId,remote);
    listing.submission={status,request_hash:claim.request_hash,submitted_at:claim.created_at,response:remote,issues:remote.issues,trace:traceSnapshot(),publication_status:current.buyable?'buyable':'not_buyable',...(current.verified?{verified_content_hash:contentHash(loaded.product,channel),verified_at:new Date().toISOString()}: {})};
    const data=await persistProduct(db,auth,loaded.product,loaded.row);
    return {data,output:{matched:true,status},report:evaluateReadiness(loaded.product,channel),content_hash:contentHash(loaded.product,channel)};
  }
  if (action==='review') await assertFamily(db, auth, loaded.product, channel);
  if (action !== 'submit') {
    const usage=['generate','classify','research'].includes(action) ? await reserveAiOperation(db,auth,sku,action) : undefined;
    try {
      const result = await applyAction(loaded.product, auth, action, options, usage?.runtime);
      await execution.beforePersist?.();
      const data = await persistProduct(db, auth, result.product, loaded.row);
      await usage?.finish('completed');
      return { data, output: result.output, report: result.report, content_hash: contentHash(result.product, channel) };
    } catch (error) { await usage?.finish('failed', error); throw error; }
  }
  if (channel !== 'amazon-us' || process.env.PRELISTING_ENABLE_PUBLICATION !== 'true' || options.confirm !== true || options.expected_hash !== contentHash(loaded.product, channel)) throw new CatalogError('Publicação desabilitada ou versão não confirmada.', 403);
  if (!evaluateReadiness(loaded.product, channel).ready) throw new CatalogError('Produto bloqueado para publicação.', 422);
  const requestHash = contentHash(loaded.product, channel);
  // Claim persisted before any external write. Unique constraint prevents concurrent or uncertain retries.
  const config=amazonConfig();
  const family=await assertFamily(db,auth,loaded.product,channel,true);
  const claimed = await db.rpc('reserve_catalog_channel_submission',{p_owner:auth.userId,p_organization:auth.organizationId,p_sku:sku,p_channel:channel,p_version:loaded.row.updated_at,p_hash:requestHash,p_payload:amazonPayload(loaded.product),p_target:{seller_id:config.sellerId,marketplace_id:config.marketplaceId,operation:'listing_put',trace:traceSnapshot(),...(family?{family}:{})}});
  if(claimed.error||!claimed.data)throw new CatalogError('Versão alterada, já reservada ou envio incerto. Recarregue e reconcilie antes de reenviar.',409);
  traceEvent('submission.reserved',{submission_id:claimed.data,content_hash:requestHash});
  try {
    const response = await amazonSubmit(loaded.product);
    if(!['ACCEPTED','INVALID'].includes(response?.status))throw new CatalogError('Resposta Amazon sem resultado comprovado. Reconcilie antes de reenviar.',503);
    const status = response.status === 'ACCEPTED' ? 'accepted' : 'rejected';
    traceEvent('submission.response',{submission_id:claimed.data,state:status});
    const listing = loaded.product._catalog!.channels[channel]!;
    listing.submission = { status, request_hash: requestHash, submitted_at: new Date().toISOString(), response, issues: response.issues,trace:traceSnapshot(), publication_status: 'not_verified' };
    const ledger = await scopeQuery(db.from('catalog_submissions').update({ status, response, updated_at: new Date().toISOString() }), auth).eq('id', claimed.data);
    if (ledger.error) throw new CatalogError('Submissão enviada; não foi possível registrar a resposta. Consulte a Amazon antes de qualquer nova tentativa.', 503);
    const data = await persistProduct(db, auth, loaded.product, loaded.row);
    return { data, output: response, report: evaluateReadiness(loaded.product, channel), content_hash: requestHash };
  } catch (error) {
    await scopeQuery(db.from('catalog_submissions').update({ status: 'unknown', updated_at: new Date().toISOString() }), auth).eq('id', claimed.data).eq('status','submitting');
    throw error;
  }
}
