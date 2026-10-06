import {describe,expect,it} from 'vitest';
import {createIsolatedTestDatabase} from './antigravity/fixtures/mock-db-helper';
const owner='00000000-0000-4000-8000-000000000001',org='00000000-0000-4000-8000-000000000002';
describe('Walmart version and account quota reservation',()=>{
 it('requires exact SKU/version/approval and shares conservative quota across SKUs',async()=>{
  const db=await createIsolatedTestDatabase();try{
   for(const sku of ['WM-1','WM-2'])await db.query('insert into public.prelistings(sku,title,owner_id,organization_id,payload) values($1,$1,$2::uuid,$3::uuid,$4::jsonb)',[sku,owner,org,JSON.stringify({relationship:'Standalone',_catalog:{channels:{'walmart-us':{approval:{hash:'a'.repeat(64)}}}}})]);
   const version=async(sku:string)=>(await db.query<{v:string}>('select updated_at::text as v from public.prelistings where sku=$1',[sku])).rows[0].v;
   const target={account_id:'synthetic-account',marketplace_id:'US',operation:'walmart_mp_item',feed_limits:{max_submissions:1,window_seconds:3600,max_bytes:10000000}},payload=(sku:string)=>({MPItemFeedHeader:{feedType:'MP_ITEM'},MPItem:[{Orderable:{sku}}]});
   const reserve=async(sku:string,hash='a'.repeat(64),body=payload(sku),config=target)=>db.query('select public.reserve_catalog_channel_submission($1::uuid,$2::uuid,$3,$4,$5::timestamptz,$6,$7::jsonb,$8::jsonb)',[owner,org,sku,'walmart-us',await version(sku),hash,JSON.stringify(body),JSON.stringify(config)]);
   await expect(reserve('WM-1','b'.repeat(64))).rejects.toThrow('approval');await expect(reserve('WM-1','a'.repeat(64),payload('WM-2'))).rejects.toThrow('Invalid Walmart');
   await reserve('WM-1');await expect(reserve('WM-2')).rejects.toThrow('quota');expect((await db.query('select * from public.catalog_submissions')).rows).toHaveLength(1);
   await expect(reserve('WM-2','a'.repeat(64),payload('WM-2'),{...target,feed_limits:{...target.feed_limits,max_submissions:2,max_bytes:1}})).rejects.toThrow('exceeds');
  }finally{await db.close();}
 },20000);
});
