import {mkdirSync,writeFileSync} from 'node:fs';
import {performance} from 'node:perf_hooks';
import {describe,it,expect} from 'vitest';
import {createIsolatedTestDatabase} from '../fixtures/mock-db-helper';
import {workerDatabaseAdapter} from '../../fixtures/pglite-worker-adapter';
import {enqueueJob} from '../../../lib/catalog/jobs';
const owner='00000000-0000-4000-8000-000000000001',foreign='00000000-0000-4000-8000-000000000002';
describe('AG05 synthetic PostgreSQL load and operational ceiling',()=>{
 it('commits 5000 versioned rows, rolls back a failed transaction and rejects a 5001 item job',async()=>{
  const db=await createIsolatedTestDatabase();
  try{
   const memory=process.memoryUsage(),started=performance.now();
   await db.exec('begin');
   await db.query(`insert into prelistings(sku,title,owner_id,organization_id,payload) select 'AG05-LOAD-'||n,'Synthetic unapproved draft',$1,$1,jsonb_build_object('sku','AG05-LOAD-'||n,'title','Synthetic unapproved draft') from generate_series(1,5000) n`,[owner]);await db.exec('commit');
   const insertedAt=performance.now();
   const rows=(await db.query<{sku:string;version:string}>('select sku,updated_at::text as version from prelistings where owner_id=$1 and organization_id=$1 order by sku',[owner])).rows;
   expect(rows).toHaveLength(5000);expect((await db.query<{count:number}>('select count(*)::int count from catalog_versions')).rows[0].count).toBe(5000);
   expect((await db.query('select sku from prelistings where owner_id=$1',[foreign])).rows).toEqual([]);
   await db.exec('begin');await db.query('update prelistings set title=$1 where sku=$2',['Rejected transaction','AG05-LOAD-1']);await expect(db.query('insert into prelistings(sku) values($1)',['AG05-LOAD-1'])).rejects.toThrow();await db.exec('rollback');
   expect((await db.query<{title:string}>('select title from prelistings where sku=$1',['AG05-LOAD-1'])).rows[0].title).toBe('Synthetic unapproved draft');
   const payload={skus:rows.map(row=>row.sku),versions:Object.fromEntries(rows.map(row=>[row.sku,row.version])),channel:'amazon-us'},adapter=workerDatabaseAdapter(db);
   expect((await enqueueJob(adapter as any,{userId:owner,organizationId:owner,mode:'trusted-gateway'},'validate',payload)).total).toBe(5000);
   await expect(enqueueJob(adapter as any,{userId:owner,organizationId:owner,mode:'trusted-gateway'},'validate',{...payload,skus:[...payload.skus,'AG05-EXCESS']})).rejects.toThrow('5.000');
   const final=process.memoryUsage();mkdirSync('artifacts/antigravity/AG-05',{recursive:true});writeFileSync('artifacts/antigravity/AG-05/sql-load.json',JSON.stringify({checked_at:new Date().toISOString(),items:5000,engine:'PGlite PostgreSQL actual migrations/triggers',insert_transaction_ms:Math.round(insertedAt-started),total_ms:Math.round(performance.now()-started),heap_growth_mb:+((final.heapUsed-memory.heapUsed)/1048576).toFixed(2),rss_mb:+(final.rss/1048576).toFixed(2),rollback_preserved:true,foreign_owner_read_count:0,job_limit_5001:'rejected',versions:5000,network:'none',limitations:'Local WASM engine bulk SQL, no real PostgREST/Auth/marketplace or worker processing of all 5000 items; no SLA inferred.'},null,2));
  }finally{await db.close();}
 },30000);
});
