import { getSupabase } from '../lib/marketing/supabase';
import { processJob } from '../lib/catalog/jobs';
import { monitorFeed } from '../lib/catalog/feed-executor';
import { amazonConfig } from '../lib/marketplaces/amazon';
import {traceWorkerFailure} from '../lib/operations/trace';
import {recoveryMode} from '../lib/operations/recovery';

async function main() {
  const db = getSupabase(); if (!db) throw new Error('Supabase não configurado.');
  const once = process.argv.includes('--once');
  let stop = false; process.on('SIGINT', () => { stop = true; }); process.on('SIGTERM', () => { stop = true; });
  do {
    let pending=db.from('catalog_jobs').select('id,owner_id,organization_id').in('status', ['pending', 'running']).lte('next_attempt_at', new Date().toISOString()).or(`lease_until.is.null,lease_until.lt.${new Date().toISOString()}`);
    if(recoveryMode())pending=pending.eq('kind','monitor');
    const query=await pending.order('created_at').limit(5);
    if (query.error) throw new Error('Fila indisponível; confira a migration.');
    for (const job of query.data || []) {
      if (stop) break;
      try { const result = await processJob(db, { userId: job.owner_id, organizationId: job.organization_id, mode: 'trusted-gateway' }, job.id); console.log(JSON.stringify({ job: job.id, status: result.status, cursor: result.cursor, total: result.total })); }
      catch (error) {await traceWorkerFailure('worker.job',{job_id:job.id},error);}
    }
    const config=amazonConfig();
    if(config.configured&&!stop) {
      const feeds=await db.from('catalog_feeds').select('id,owner_id,organization_id,target').in('status',['processing','unknown']).not('feed_id','is',null).lte('updated_at',new Date(Date.now()-60000).toISOString()).or(`lease_until.is.null,lease_until.lt.${new Date().toISOString()}`).order('updated_at').limit(2);
      if(feeds.error)console.error('Monitor de feeds indisponível; confira a migration.');
      for(const feed of feeds.data||[]) {
        if(stop)break;
        if(feed.target?.seller_id!==config.sellerId||feed.target?.marketplace_id!==config.marketplaceId)continue;
        try{const result=await monitorFeed(db,{userId:feed.owner_id,organizationId:feed.organization_id,mode:'trusted-gateway'},feed.id);console.log(JSON.stringify({feed:feed.id,status:result.status,processing_status:result.processing_status}));}
        catch(error){await traceWorkerFailure('worker.feed',{feed_id:feed.id},error);}
      }
    }
    if (!once && !stop) await new Promise(resolve => setTimeout(resolve, 2000));
  } while (!once && !stop);
}
main().catch(async error => {await traceWorkerFailure('worker.main',{},error);process.exitCode = 1;});
