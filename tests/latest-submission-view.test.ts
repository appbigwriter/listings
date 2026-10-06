import {describe,expect,it} from 'vitest';
import {createIsolatedTestDatabase} from './antigravity/fixtures/mock-db-helper';
describe('latest receipt for read-only polling',()=>{
 it('selects the latest rejected outcome instead of resurrecting an old accepted claim; view remains private/invoker',async()=>{
  const db=await createIsolatedTestDatabase();try{
   const owner='00000000-0000-4000-8000-000000000001',org='00000000-0000-4000-8000-000000000002';
   for(const [status,hash,created] of [['accepted','a','2026-10-05T10:00:00Z'],['rejected','b','2026-10-05T11:00:00Z']])await db.query('insert into public.catalog_submissions(owner_id,organization_id,sku,channel,request_hash,status,created_at) values($1::uuid,$2::uuid,$3,$4,$5,$6,$7::timestamptz)',[owner,org,'SKU','amazon-us',hash.repeat(64),status,created]);
   expect((await db.query<{status:string}>('select status from public.catalog_latest_submissions')).rows).toEqual([{status:'rejected'}]);
   expect((await db.query<{options:string[]}>("select reloptions as options from pg_class where oid='public.catalog_latest_submissions'::regclass")).rows[0].options).toContain('security_invoker=true');
   await db.exec('set role authenticated');await expect(db.query('select * from public.catalog_latest_submissions')).rejects.toThrow('permission denied');
  }finally{await db.close();}
 },20000);
});
