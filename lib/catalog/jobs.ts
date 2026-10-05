import type { SupabaseClient } from '@supabase/supabase-js';
import type { AuthContext } from '../auth';
import { hash, type ProductInput } from './model';
import { executeAction } from './executor';
import { CatalogError, loadProduct, mergeDraft, persistProduct, scopeQuery } from './repository';
import { AmazonError } from '../marketplaces/amazon';

export type JobKind = 'import' | 'classify' | 'generate' | 'validate' | 'media' | 'monitor';
export const JOB_KINDS: JobKind[] = ['import', 'classify', 'generate', 'validate', 'media', 'monitor'];
export async function cancelJob(db: SupabaseClient, auth: AuthContext, id: string) {
  const cancelled = await scopeQuery(db.from('catalog_jobs').update({ status: 'cancelled', updated_at: new Date().toISOString() }), auth).eq('id', id).in('status', ['pending','running']).select('*').maybeSingle();
  if (cancelled.error) throw new CatalogError('Não foi possível cancelar o lote.', 503);
  if (cancelled.data) return cancelled.data;
  const existing = await scopeQuery(db.from('catalog_jobs').select('*'), auth).eq('id',id).maybeSingle();
  if (existing.error || !existing.data) throw new CatalogError('Lote não encontrado.',404);
  return existing.data;
}
export async function enqueueJob(db: SupabaseClient, auth: AuthContext, kind: JobKind, payload: Record<string, unknown>) {
  if (!JOB_KINDS.includes(kind)) throw new CatalogError('Tipo de processamento inválido.');
  const count = kind === 'import' ? (payload.products as unknown[]).length : (payload.skus as unknown[]).length;
  if (!count || count > 5000) throw new CatalogError('Selecione entre um e 5.000 itens.');
  const identity = kind === 'import' ? { source: payload.source, products: (payload.products as ProductInput[]).map(product => ({ sku: product.sku, hash: product._catalog?.source?.hash })) } : payload;
  const idempotency_key = hash({ kind, payload: identity, owner: auth.userId, organization: auth.organizationId });
  const old = await scopeQuery(db.from('catalog_jobs').select('*'), auth).eq('idempotency_key', idempotency_key).maybeSingle();
  if (old.error) throw new CatalogError('Fila indisponível. Aplique a migration de catálogo.', 503);
  if (old.data) return old.data;
  const result = await db.from('catalog_jobs').insert({ kind, payload, total: count, owner_id: auth.userId, organization_id: auth.organizationId, idempotency_key }).select('*').single();
  if (result.error) { if (result.error.code === '23505') { const existing = await scopeQuery(db.from('catalog_jobs').select('*'), auth).eq('idempotency_key', idempotency_key).single(); if (!existing.error) return existing.data; } throw new CatalogError('Não foi possível criar o processamento.', 503); }
  return result.data;
}
export async function processJob(db: SupabaseClient, auth: AuthContext, id: string) {
  const found = await scopeQuery(db.from('catalog_jobs').select('*'), auth).eq('id', id).maybeSingle();
  if (found.error || !found.data) throw new CatalogError('Processamento não encontrado.', 404);
  const job = found.data;
  if (job.status === 'completed' || job.status === 'cancelled' || job.status === 'failed') return job;
  if (Date.parse(job.next_attempt_at) > Date.now() || job.lease_until && Date.parse(job.lease_until) > Date.now()) return job;
  const leaseToken = crypto.randomUUID();
  const lease_until = new Date(Date.now() + 180000).toISOString();
  const claimed = await scopeQuery(db.from('catalog_jobs').update({ status: 'running', lease_token: leaseToken, lease_until, updated_at: new Date().toISOString() }), auth).eq('id', id).eq('updated_at', job.updated_at).or(`lease_until.is.null,lease_until.lt.${new Date().toISOString()}`).select('*').maybeSingle();
  if (claimed.error || !claimed.data) throw new CatalogError('Processamento já reservado por outro worker.', 409);
  const index = Number(job.cursor); const entries = job.kind === 'import' ? job.payload.products : job.payload.skus;
  let outcome: Record<string, unknown>; let attempts = Number(job.attempts); let cursor = index;
  let status = 'pending'; let next_attempt_at = new Date().toISOString();
  try {
    if (job.kind === 'import') {
      const incoming = entries[index] as ProductInput;
      let existing;
      try { existing = await loadProduct(db, auth, String(incoming.sku)); } catch (error) { if (!(error instanceof CatalogError) || error.status !== 404) throw error; }
      if (existing?.product._catalog?.source?.hash === incoming._catalog?.source?.hash) outcome = { index, sku: incoming.sku, status: 'unchanged' };
      else if (existing) {
        // Preserve reviewed catalog; changed source becomes a pending reconciliation task.
        const next = mergeDraft(existing.product, { source_update: incoming._catalog?.source });
        await persistProduct(db, auth, next, existing.row); outcome = { index, sku: incoming.sku, status: 'source_changed_review_required' };
      } else { await persistProduct(db, auth, incoming); outcome = { index, sku: incoming.sku, status: 'imported' }; }
    } else {
      const sku = String(entries[index]); const result = await executeAction(db, auth, sku, job.kind, { channel: job.payload.channel, updated_at: job.payload.versions?.[sku] });
      outcome = { index, sku, status: 'processed', blockers: result.report.issues.length };
    }
    cursor++; attempts = 0;
  } catch (error) {
    attempts++;
    const retryable = error instanceof AmazonError ? error.status === 429 || error.status >= 500 : error instanceof CatalogError ? error.status === 503 || error.status === 409 : error instanceof TypeError;
    if (retryable && attempts < 3) { next_attempt_at = new Date(Date.now() + Math.max(error instanceof AmazonError ? error.retryAfter * 1000 : 0, 10000 * 2 ** attempts)).toISOString(); outcome = { index, status: 'retry', error: error instanceof Error ? error.message : 'Falha temporária.' }; }
    else { cursor++; attempts = 0; outcome = { index, sku: String(entries[index]?.sku || entries[index]), status: 'failed', error: error instanceof Error ? error.message : 'Falha ao processar.' }; }
  }
  const results = [...job.results, outcome];
  if (cursor >= job.total) status = 'completed';
  const saved = await scopeQuery(db.from('catalog_jobs').update({ status, cursor, attempts, next_attempt_at, results, lease_token: null, lease_until: null, updated_at: new Date().toISOString() }), auth).eq('id', id).eq('status','running').eq('lease_token', leaseToken).select('*').maybeSingle();
  if (!saved.error && !saved.data) {
    const latest = await scopeQuery(db.from('catalog_jobs').select('*'),auth).eq('id',id).maybeSingle();
    if (latest.data?.status === 'cancelled') return latest.data;
  }
  if (saved.error || !saved.data) throw new CatalogError('Worker perdeu a reserva; consulte o estado antes de continuar.', 409);
  return saved.data;
}
