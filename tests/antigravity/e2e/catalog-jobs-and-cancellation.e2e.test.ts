import {afterAll,beforeAll,describe,expect,it} from 'vitest';
import type {PGlite} from '@electric-sql/pglite';
import {createIsolatedTestDatabase} from '../fixtures/mock-db-helper';
import {MOCK_ORGANIZATION_A,MOCK_USER_OPERATOR_A} from '../fixtures/auth-fixtures';
import {retryEntries} from '../../../lib/catalog/job-retry';
import {hash} from '../../../lib/catalog/model';

// Database/contract regressions. These do not replace browser or live-worker journeys.
describe('AG-01: preparation queue contracts on the actual migration schema',()=>{
 let db:PGlite;
 beforeAll(async()=>{db=await createIsolatedTestDatabase();},30000);
 afterAll(async()=>{await db?.close();});
 const scope=[MOCK_USER_OPERATOR_A,MOCK_ORGANIZATION_A];
 it('creates a preparation job without creating marketplace submissions',async()=>{
  await db.exec('begin');try{
   const row=(await db.query<{status:string;cursor:number}>(`insert into catalog_jobs(owner_id,organization_id,kind,idempotency_key,payload,total) values($1,$2,'validate','prepare-001','{"skus":["SKU-001"]}',1) returning status,cursor`,scope)).rows[0];
   expect(row).toEqual({status:'pending',cursor:0});
   expect((await db.query<{total:number}>('select count(*)::int as total from catalog_submissions')).rows[0].total).toBe(0);
   await db.exec('savepoint duplicate');
   await expect(db.query(`insert into catalog_jobs(owner_id,organization_id,kind,idempotency_key,payload,total) values($1,$2,'validate','prepare-001','{"skus":["SKU-001"]}',1)`,scope)).rejects.toThrow(/unique/i);
   await db.exec('rollback to savepoint duplicate');
   await db.exec('savepoint invalid_kind');
   await expect(db.query(`insert into catalog_jobs(owner_id,organization_id,kind,idempotency_key,payload,total) values($1,$2,'batch_submission','publish','{}',1)`,scope)).rejects.toThrow(/check/i);
   await db.exec('rollback to savepoint invalid_kind');
  }finally{await db.exec('rollback');}
 });
 it('cancellation rejects stale worker checkpoints and preserves uncertain submissions',async()=>{
  await db.exec('begin');try{
   const job=(await db.query<{id:string;lease_token:string}>(`insert into catalog_jobs(owner_id,organization_id,kind,status,idempotency_key,payload,total,cursor,results,lease_token) values($1,$2,'validate','running','cancel-001','{"skus":["SKU-001","SKU-002"]}',2,1,'[{"index":0,"status":"completed"}]',gen_random_uuid()) returning id,lease_token`,scope)).rows[0];
   await db.query(`insert into catalog_submissions(owner_id,organization_id,sku,channel,request_hash,status) values($1,$2,'SKU-002','amazon-us','uncertain-001','unknown')`,scope);
   await db.query(`update catalog_jobs set status='cancelled',lease_token=null,lease_until=null where id=$1`,[job.id]);
   const stale=await db.query(`update catalog_jobs set cursor=2,status='completed' where id=$1 and status='running' and lease_token=$2 returning id`,[job.id,job.lease_token]);
   expect(stale.rows).toHaveLength(0);
   const checkpoint=(await db.query<{status:string;cursor:number;results:unknown}>(`select status,cursor,results from catalog_jobs where id=$1`,[job.id])).rows[0];
   expect(checkpoint).toEqual({status:'cancelled',cursor:1,results:[{index:0,status:'completed'}]});
   expect((await db.query<{status:string}>(`select status from catalog_submissions where request_hash='uncertain-001'`)).rows[0].status).toBe('unknown');
  }finally{await db.exec('rollback');}
 });
 it('retries selected preparation failures once while preserving the original checkpoint',async()=>{
  await db.exec('begin');try{
   const parent=(await db.query<any>(`insert into catalog_jobs(owner_id,organization_id,kind,status,idempotency_key,payload,total,cursor,results) values($1,$2,'validate','failed','parent-001','{"skus":["SKU-001","SKU-002","SKU-003"]}',3,2,'[{"index":0,"status":"completed"},{"index":1,"status":"failed"}]') returning *`,scope)).rows[0];
   const retry=retryEntries(parent,'failed');expect(retry).toEqual({indices:[1],entries:['SKU-002']});
   expect(retryEntries(parent,'unfinished').entries).toEqual(['SKU-003']);
   const key=hash({retry_of:parent.id,scope:'failed'}),payload=JSON.stringify({skus:retry.entries,retry_of:parent.id,retry_indices:retry.indices});
   await db.query(`insert into catalog_jobs(owner_id,organization_id,kind,idempotency_key,payload,total) values($1,$2,'validate',$3,$4,1)`,[...scope,key,payload]);
   await db.exec('savepoint duplicate_retry');
   await expect(db.query(`insert into catalog_jobs(owner_id,organization_id,kind,idempotency_key,payload,total) values($1,$2,'validate',$3,$4,1)`,[...scope,key,payload])).rejects.toThrow(/unique/i);
   await db.exec('rollback to savepoint duplicate_retry');
   const original=(await db.query<{status:string;cursor:number;results:unknown}>(`select status,cursor,results from catalog_jobs where id=$1`,[parent.id])).rows[0];
   expect(original).toEqual({status:'failed',cursor:2,results:parent.results});
   expect((await db.query<{total:number}>('select count(*)::int as total from catalog_submissions')).rows[0].total).toBe(0);
  }finally{await db.exec('rollback');}
 });
});
