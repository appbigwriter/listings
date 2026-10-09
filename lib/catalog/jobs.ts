import type { SupabaseClient } from '@supabase/supabase-js';
import type { AuthContext } from '../auth';
import { hash, type ProductInput } from './model';
import { executeAction } from './executor';
import { CatalogError, loadProduct, persistProduct, scopeQuery } from './repository';
import {stageSourceUpdate} from './source-diff';
import {retryEntries} from './job-retry';
import { AmazonError } from '../marketplaces/amazon';
import {EbayError} from '../marketplaces/ebay';
import {WalmartError} from '../marketplaces/walmart';
import {startJobLease} from './job-lease';
import {invalidJobCheckpoint} from './job-checkpoint';
import {traceEvent,traceSnapshot,traceHash,withTrace} from '../operations/trace';
import {assertRecoveryReleased,recoveryMode} from '../operations/recovery';

export type JobKind = 'import' | 'research' | 'classify' | 'generate' | 'validate' | 'media' | 'monitor' | 'schema';
export const JOB_KINDS: JobKind[] = ['import', 'research', 'classify', 'generate', 'validate', 'media', 'monitor','schema'];
export async function cancelJob(db: SupabaseClient, auth: AuthContext, id: string) {
  const cancelled = await scopeQuery(db.from('catalog_jobs').update({ status: 'cancelled', updated_at: new Date().toISOString() }), auth).eq('id', id).in('status', ['pending','running']).select('*').maybeSingle();
  if (cancelled.error) throw new CatalogError('Não foi possível cancelar o lote.', 503);
  if (cancelled.data) return cancelled.data;
  const existing = await scopeQuery(db.from('catalog_jobs').select('*'), auth).eq('id',id).maybeSingle();
  if (existing.error || !existing.data) throw new CatalogError('Lote não encontrado.',404);
  return existing.data;
}
export async function enqueueJob(db: SupabaseClient, auth: AuthContext, kind: JobKind, payload: Record<string, unknown>,internal:{idempotencyIdentity?:unknown}={}) {
  if(kind!=='monitor')assertRecoveryReleased();
  if (!JOB_KINDS.includes(kind)) throw new CatalogError('Tipo de processamento inválido.');
  const count = kind === 'import' ? (payload.products as unknown[]).length : (payload.skus as unknown[]).length;
  if (!count || count > 5000) throw new CatalogError('Selecione entre um e 5.000 itens.');
  const identity = payload.retry_of?{retry_of:payload.retry_of,retry_scope:payload.retry_scope}:kind === 'import' ? { source: payload.source,retry_of:payload.retry_of,retry_scope:payload.retry_scope, products: (payload.products as ProductInput[]).map(product => ({ sku: product.sku, hash: product._catalog?.source?.hash })) } : payload;
  const idempotency_key = hash({ kind, payload: internal.idempotencyIdentity??identity, owner: auth.userId, organization: auth.organizationId });
  const old = await scopeQuery(db.from('catalog_jobs').select('*'), auth).eq('idempotency_key', idempotency_key).maybeSingle();
  if (old.error) throw new CatalogError('Fila indisponível. Aplique a migration de catálogo.', 503);
  if (old.data) return old.data;
  const result = await db.from('catalog_jobs').insert({ kind, payload, total: count, owner_id: auth.userId, organization_id: auth.organizationId, idempotency_key }).select('*').single();
  if (result.error) { if (result.error.code === '23505') { const existing = await scopeQuery(db.from('catalog_jobs').select('*'), auth).eq('idempotency_key', idempotency_key).single(); if (!existing.error) return existing.data; } throw new CatalogError('Não foi possível criar o processamento.', 503); }
  return result.data;
}
export async function retryJob(db:SupabaseClient,auth:AuthContext,body:Record<string,unknown>){
 if(body.confirm!==true)throw new CatalogError('Confirme a criação de uma nova tentativa.');
 const result=await scopeQuery(db.from('catalog_jobs').select('*'),auth).eq('id',String(body.id||'')).maybeSingle();
 if(result.error)throw new CatalogError('Não foi possível conferir o lote.',503);if(!result.data)throw new CatalogError('Lote não encontrado.',404);
 const job=result.data;if(body.expected_version!==job.updated_at)throw new CatalogError('O checkpoint mudou. Recarregue antes de retomar.',409);
 if(!JOB_KINDS.includes(job.kind))throw new CatalogError('Este tipo de lote não admite retomada.');
 const retry=retryEntries(job,body.scope);
 const payload={...job.payload,retry_of:job.id,retry_scope:body.scope,retry_indices:retry.indices};
 if(job.kind==='import')payload.products=retry.entries;
 else{
  payload.skus=retry.entries;payload.versions={};
  for(let offset=0;offset<retry.entries.length;offset+=5)await Promise.all(retry.entries.slice(offset,offset+5).map(async sku=>{const current=await loadProduct(db,auth,String(sku));payload.versions[String(sku)]=current.row.updated_at;}));
 }
 return enqueueJob(db,auth,job.kind,payload);
}
export async function processJob(db: SupabaseClient, auth: AuthContext, id: string) {
  return withTrace('job.step',{job_id:id,organization_hash:traceHash(auth.organizationId)},()=>processJobStep(db,auth,id));
}
async function processJobStep(db:SupabaseClient,auth:AuthContext,id:string){
  const found = await scopeQuery(db.from('catalog_jobs').select('*'), auth).eq('id', id).maybeSingle();
  if (found.error || !found.data) throw new CatalogError('Processamento não encontrado.', 404);
  const job = found.data;
  if (job.status === 'completed' || job.status === 'cancelled' || job.status === 'failed') return job;
  if(recoveryMode()&&job.kind!=='monitor')return job;
  if (Date.parse(job.next_attempt_at) > Date.now() || job.lease_until && Date.parse(job.lease_until) > Date.now()) return job;
  const leaseToken = crypto.randomUUID();
  const lease_until = new Date(Date.now() + 180000).toISOString();
  const claimed = await scopeQuery(db.from('catalog_jobs').update({ status: 'running', lease_token: leaseToken, lease_until, updated_at: new Date().toISOString() }), auth).eq('id', id).eq('updated_at', job.updated_at).or(`lease_until.is.null,lease_until.lt.${new Date().toISOString()}`).select('*').maybeSingle();
  if (claimed.error || !claimed.data) throw new CatalogError('Processamento já reservado por outro worker.', 409);
  const invalid=invalidJobCheckpoint(job);
  if(invalid){
    const diagnostic={status:'failed',code:'invalid_job_checkpoint',field:invalid,trace:traceSnapshot(),error:'Checkpoint inválido; investigar a origem e preparar um lote válido.',...(Array.isArray(job.results)?{}:{original_results:job.results})};
    const failed=await scopeQuery(db.from('catalog_jobs').update({status:'failed',results:[...(Array.isArray(job.results)?job.results:[]),diagnostic],lease_token:null,lease_until:null,updated_at:new Date().toISOString()}),auth).eq('id',id).eq('status','running').eq('lease_token',leaseToken).select('*').maybeSingle();
    if(failed.error||!failed.data)throw new CatalogError('Checkpoint inválido sem confirmação persistida; investigue a fila.',503);
    return failed.data;
  }
  const lease=startJobLease(db,auth,id,leaseToken);
  try{
  const index = Number(job.cursor); const entries = job.kind === 'import' ? job.payload.products : job.payload.skus;
  let outcome: Record<string, unknown>; let attempts = Number(job.attempts); let cursor = index;
  let status = 'pending'; let next_attempt_at = new Date().toISOString();
  try {
    await lease.assert();
    if (job.kind === 'import') {
      const incoming = entries[index] as ProductInput;
      let existing;
      try { existing = await loadProduct(db, auth, String(incoming.sku)); } catch (error) { if (!(error instanceof CatalogError) || error.status !== 404) throw error; }
      if (existing?.product._catalog?.source?.hash === incoming._catalog?.source?.hash) outcome = { index, sku: incoming.sku, status: 'unchanged' };
      else if (existing) {
        // Preserve reviewed catalog; changed source becomes a pending reconciliation task.
        const next = stageSourceUpdate(existing.product,incoming._catalog?.source);
        await lease.assert();await persistProduct(db, auth, next, existing.row); outcome = { index, sku: incoming.sku, status: 'source_changed_review_required' };
      } else {await lease.assert(); await persistProduct(db, auth, incoming); outcome = { index, sku: incoming.sku, status: 'imported' }; }
    } else {
      const sku = String(entries[index]); const result = await executeAction(db, auth, sku, job.kind, { channel: job.payload.channel, updated_at: job.payload.versions?.[sku] },{beforePersist:lease.assert});
      outcome = { index, sku, status: 'processed', blockers: result.report.issues.length };
    }
    cursor++; attempts = 0;
  } catch (error) {
    attempts++;
    const providerError=error instanceof AmazonError||error instanceof EbayError||error instanceof WalmartError;
    const retryable = providerError ? error.status === 429 || error.status >= 500 : error instanceof CatalogError ? error.status === 503 || error.status === 409 : error instanceof TypeError;
    if (retryable && attempts < 3) { next_attempt_at = new Date(Date.now() + Math.max(providerError ? error.retryAfter * 1000 : 0, 10000 * 2 ** attempts)).toISOString(); outcome = { index, status: 'retry', error: error instanceof Error ? error.message : 'Falha temporária.' }; }
    else { cursor++; attempts = 0; outcome = { index, sku: String(entries[index]?.sku || entries[index]), status: 'failed', error: error instanceof Error ? error.message : 'Falha ao processar.' }; }
  }
  const outcomeSku=job.kind==='import'?entries[index]?.sku:entries[index];
  const results = [...job.results, {...outcome,trace:traceSnapshot({...(typeof outcomeSku==='string'?{sku_hash:traceHash(outcomeSku)}:{})})}];
  if (cursor >= job.total) status = 'completed';
  const saved = await scopeQuery(db.from('catalog_jobs').update({ status, cursor, attempts, next_attempt_at, results, lease_token: null, lease_until: null, updated_at: new Date().toISOString() }), auth).eq('id', id).eq('status','running').eq('lease_token', leaseToken).gt('lease_until',new Date().toISOString()).select('*').maybeSingle();
  if (!saved.error && !saved.data) {
    const latest = await scopeQuery(db.from('catalog_jobs').select('*'),auth).eq('id',id).maybeSingle();
    if (latest.data?.status === 'cancelled') return latest.data;
  }
  if (saved.error || !saved.data) throw new CatalogError('Worker perdeu a reserva; consulte o estado antes de continuar.', 409);
  traceEvent('job.checkpoint',{state:saved.data.status,cursor:saved.data.cursor,total:saved.data.total});
  return saved.data;
  }finally{await lease.close();}
}
