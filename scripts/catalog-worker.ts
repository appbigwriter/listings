import { getSupabase } from '../lib/marketing/supabase';
import { processJob } from '../lib/catalog/jobs';

async function main() {
  const db = getSupabase(); if (!db) throw new Error('Supabase não configurado.');
  const once = process.argv.includes('--once');
  let stop = false; process.on('SIGINT', () => { stop = true; }); process.on('SIGTERM', () => { stop = true; });
  do {
    const query = await db.from('catalog_jobs').select('id,owner_id,organization_id').in('status', ['pending', 'running']).lte('next_attempt_at', new Date().toISOString()).or(`lease_until.is.null,lease_until.lt.${new Date().toISOString()}`).order('created_at').limit(5);
    if (query.error) throw new Error('Fila indisponível; confira a migration.');
    for (const job of query.data || []) {
      if (stop) break;
      try { const result = await processJob(db, { userId: job.owner_id, organizationId: job.organization_id, mode: 'trusted-gateway' }, job.id); console.log(JSON.stringify({ job: job.id, status: result.status, cursor: result.cursor, total: result.total })); }
      catch (error) { console.error(error instanceof Error ? error.message : 'Falha no worker.'); }
    }
    if (!once && !stop) await new Promise(resolve => setTimeout(resolve, 2000));
  } while (!once && !stop);
}
main().catch(error => { console.error(error instanceof Error ? error.message : 'Falha no worker.'); process.exitCode = 1; });
