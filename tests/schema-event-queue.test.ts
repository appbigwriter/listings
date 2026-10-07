import {describe,expect,it} from 'vitest';
import {createIsolatedTestDatabase} from './antigravity/fixtures/mock-db-helper';
const org='00000000-0000-4000-8000-000000000001',owner='00000000-0000-4000-8000-000000000002';
describe('schema notification durable fanout',()=>{
 it('sets publication hold and queues exact versions atomically; duplicates do not replay; unowned/archive/foreign rows stay untouched',async()=>{
  const db=await createIsolatedTestDatabase(undefined,async db=>{await db.query('insert into public.prelistings(sku,title,payload) values($1,$1,$2::jsonb)',['LEGACY',JSON.stringify({_catalog:{channels:{'amazon-us':{product_type:'SIGN'}}}})]);});try{
   for(const [sku,type,owned,status,organization] of [['ACTIVE','SIGN',true,'draft',org],['OTHER-TYPE','OTHER',true,'draft',org],['ARCHIVED','SIGN',true,'archived',org],['OTHER-ORG','SIGN',true,'draft',owner]] as const){const payload={_catalog:{channels:{'amazon-us':{product_type:type}}}};await db.query('insert into public.prelistings(sku,title,owner_id,organization_id,status,payload) values($1,$1,$2::uuid,$3::uuid,$4,$5::jsonb)',[sku,owned?owner:null,organization,status,JSON.stringify(payload)]);}
   const enqueue=async(id='event-1',hash='a'.repeat(64),types=['SIGN'])=>(await db.query<{result:any}>('select public.enqueue_amazon_schema_event($1::uuid,$2,$3,$4,$5,$6::timestamptz,$7::jsonb) as result',[org,id,hash,'synthetic-seller','synthetic-version',new Date().toISOString(),JSON.stringify(types)])).rows[0].result;
   expect(await enqueue()).toMatchObject({status:'queued',queued_jobs:2,duplicate:false});expect(await enqueue()).toMatchObject({queued_jobs:2,duplicate:true});
   expect((await db.query('select * from public.catalog_jobs')).rows).toHaveLength(2);
   const rows=(await db.query<{sku:string;payload:any}>('select sku,payload from public.prelistings order by sku')).rows;for(const row of rows.filter(row=>['ACTIVE','OTHER-TYPE'].includes(row.sku)))expect(row.payload._catalog.channels['amazon-us'].schema_refresh_pending).toBeDefined();for(const row of rows.filter(row=>!['ACTIVE','OTHER-TYPE'].includes(row.sku)))expect(row.payload._catalog.channels['amazon-us'].schema_refresh_pending).toBeUndefined();
   expect((await db.query<{matched:boolean}>("select j.payload#>>'{versions,ACTIVE}'=(select to_jsonb(p.updated_at)#>>'{}' from public.prelistings p where p.sku='ACTIVE') as matched from public.catalog_jobs j")).rows[0].matched).toBe(true);
   await expect(enqueue('event-1','b'.repeat(64))).rejects.toThrow('Conflicting');expect((await db.query('select * from public.catalog_jobs')).rows).toHaveLength(2);
   expect(await enqueue('global-event','c'.repeat(64),[])).toMatchObject({queued_jobs:2});
   expect((await db.query<{status:string}>('select status from public.catalog_jobs order by created_at,id limit 2')).rows.map(row=>row.status)).toEqual(['cancelled','cancelled']);
   expect((await db.query<{client:boolean}>("select has_function_privilege('authenticated','public.enqueue_amazon_schema_event(uuid,text,text,text,text,timestamptz,jsonb)','execute') as client")).rows[0].client).toBe(false);
  }finally{await db.close();}
 },20000);
});
