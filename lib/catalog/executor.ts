import type { SupabaseClient } from '@supabase/supabase-js';
import { hasCapability, type AuthContext } from '../auth';
import { amazonSubmit } from '../marketplaces/amazon';
import { applyAction } from './actions';
import { contentHash, isChannel } from './model';
import { evaluateReadiness } from './readiness';
import { CatalogError, loadProduct, persistProduct, scopeQuery } from './repository';
import { assertFamily } from './family';
import { reserveAiOperation } from '../ai/usage';

export async function executeAction(db: SupabaseClient, auth: AuthContext, sku: string, action: string, options: Record<string, unknown> = {}) {
  if (options.channel !== undefined && !isChannel(options.channel)) throw new CatalogError('Canal inválido.');
  if (action === 'review' && !hasCapability(auth, 'review') || action === 'submit' && !hasCapability(auth, 'publish')) throw new CatalogError('Seu papel não permite esta ação.', 403);
  const loaded = await loadProduct(db, auth, sku);
  if (options.updated_at && options.updated_at !== loaded.row.updated_at) throw new CatalogError('A versão mudou. Recarregue o produto.', 409);
  const channel = isChannel(options.channel) ? options.channel : 'amazon-us';
  if (['review', 'submit'].includes(action)) await assertFamily(db, auth, loaded.product, channel);
  if (action !== 'submit') {
    const usage=['generate','classify'].includes(action) ? await reserveAiOperation(db,auth,sku,action) : undefined;
    try {
      const result = await applyAction(loaded.product, auth, action, options, usage?.runtime);
      const data = await persistProduct(db, auth, result.product, loaded.row);
      await usage?.finish('completed');
      return { data, output: result.output, report: result.report, content_hash: contentHash(result.product, channel) };
    } catch (error) { await usage?.finish('failed'); throw error; }
  }
  if (channel !== 'amazon-us' || process.env.PRELISTING_ENABLE_PUBLICATION !== 'true' || options.confirm !== true || options.expected_hash !== contentHash(loaded.product, channel)) throw new CatalogError('Publicação desabilitada ou versão não confirmada.', 403);
  if (!evaluateReadiness(loaded.product, channel).ready) throw new CatalogError('Produto bloqueado para publicação.', 422);
  const requestHash = contentHash(loaded.product, channel);
  // Claim persisted before any external write. Unique constraint prevents concurrent or uncertain retries.
  const claimed = await db.from('catalog_submissions').insert({ owner_id: auth.userId, organization_id: auth.organizationId, sku, channel, request_hash: requestHash, status: 'submitting' }).select('id').single();
  if (claimed.error) throw new CatalogError(claimed.error.code === '23505' ? 'Esta versão já foi enviada ou precisa de reconciliação.' : 'Não foi possível reservar a submissão. Verifique a migration.', claimed.error.code === '23505' ? 409 : 503);
  try {
    const response = await amazonSubmit(loaded.product);
    const status = response.status === 'ACCEPTED' ? 'accepted' : 'rejected';
    const listing = loaded.product._catalog!.channels[channel]!;
    listing.submission = { status, request_hash: requestHash, submitted_at: new Date().toISOString(), response, issues: response.issues, publication_status: 'not_verified' };
    const ledger = await scopeQuery(db.from('catalog_submissions').update({ status, response, updated_at: new Date().toISOString() }), auth).eq('id', claimed.data.id);
    if (ledger.error) throw new CatalogError('Submissão enviada; não foi possível registrar a resposta. Consulte a Amazon antes de qualquer nova tentativa.', 503);
    const data = await persistProduct(db, auth, loaded.product, loaded.row);
    return { data, output: response, report: evaluateReadiness(loaded.product, channel), content_hash: requestHash };
  } catch (error) {
    await scopeQuery(db.from('catalog_submissions').update({ status: 'unknown', updated_at: new Date().toISOString() }), auth).eq('id', claimed.data.id);
    throw error;
  }
}
