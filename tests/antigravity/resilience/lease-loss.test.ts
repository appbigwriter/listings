import {describe,it,expect} from 'vitest';
import {createIsolatedTestDatabase} from '../fixtures/mock-db-helper';
import {workerDatabaseAdapter} from '../../fixtures/pglite-worker-adapter';
import {startJobLease} from '../../../lib/catalog/job-lease';
const owner='00000000-0000-4000-8000-000000000001',auth={userId:owner,organizationId:owner,mode:'trusted-gateway' as const},token='00000000-0000-4000-8000-000000000010';
describe('AG05 real lease assertions after cancellation expiry or transfer',()=>{
 for(const kind of ['cancelled','expired','transferred'])it('refuses beforePersist when lease is '+kind,async()=>{
  const db=await createIsolatedTestDatabase();let lease:ReturnType<typeof startJobLease>|undefined;
  try{
   const job=(await db.query<{id:string}>(`insert into catalog_jobs(owner_id,organization_id,kind,idempotency_key,status,total,payload,lease_token,lease_until) values($1,$1,'validate',$2,'running',1,'{"skus":["fixture"]}',$3,now()+interval '3 minutes') returning id`,[owner,'AG05-'+kind,token])).rows[0];
   lease=startJobLease(workerDatabaseAdapter(db) as any,auth,job.id,token);await expect(lease.assert()).resolves.toBeUndefined();
   if(kind==='cancelled')await db.query(`update catalog_jobs set status='cancelled' where id=$1`,[job.id]);
   if(kind==='expired')await db.query(`update catalog_jobs set lease_until=now()-interval '1 second' where id=$1`,[job.id]);
   if(kind==='transferred')await db.query(`update catalog_jobs set lease_token=gen_random_uuid() where id=$1`,[job.id]);
   await expect(lease.assert()).rejects.toMatchObject({status:409});await expect(lease.assert()).rejects.toMatchObject({status:409});
   expect((await db.query<{cursor:number}>('select cursor from catalog_jobs where id=$1',[job.id])).rows[0].cursor).toBe(0);
  }finally{await lease?.close();await db.close();}
 },10000);
});
