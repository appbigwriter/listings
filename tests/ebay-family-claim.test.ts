import {describe,expect,it} from 'vitest';
import {createIsolatedTestDatabase} from './antigravity/fixtures/mock-db-helper';
const owner='00000000-0000-4000-8000-000000000001',org='00000000-0000-4000-8000-000000000002';
describe('eBay family atomic reservation and checkpoints',()=>{
 it('reserves every approved version together, keeps uncertain members blocking and commits outcomes atomically',async()=>{
  const db=await createIsolatedTestDatabase();try{
   for(const sku of ['PARENT','RED','BLUE'])await db.query('insert into public.prelistings(sku,title,owner_id,organization_id,payload) values($1,$1,$2::uuid,$3::uuid,$4::jsonb)',[sku,owner,org,JSON.stringify({relationship:sku==='PARENT'?'Parent':'Child',...(sku!=='PARENT'?{parent_sku:'PARENT'}:{}),_catalog:{channels:{'ebay-us':{approval:{hash:'a'.repeat(64)}}}}})]);
   const manifest=(await db.query<{sku:string;updated_at:string}>('select sku,updated_at::text from public.prelistings order by sku')).rows.map(row=>({...row,content_hash:'a'.repeat(64)}));
   const payload={group:{variantSKUs:['RED','BLUE']},members:['RED','BLUE'].map(sku=>({sku,inventory:{product:{title:sku}},offer:{sku}}))},target={account_id:'synthetic-account',marketplace_id:'EBAY_US',manifest_hash:'b'.repeat(64)};
   const reserve=async(list=manifest)=>(await db.query<{id:string}>('select public.reserve_ebay_family_submission($1::uuid,$2::uuid,$3,$4::jsonb,$5::jsonb,$6::jsonb) as id',[owner,org,'PARENT',JSON.stringify(list),JSON.stringify(payload),JSON.stringify(target)])).rows[0].id;
   await expect(reserve(manifest.map((row,index)=>index===0?{...row,updated_at:'2000-01-01T00:00:00Z'}:row))).rejects.toThrow('version');expect((await db.query('select * from public.catalog_submissions')).rows).toHaveLength(0);
   const id=await reserve();expect((await db.query('select * from public.catalog_submissions')).rows).toHaveLength(3);await expect(reserve()).rejects.toThrow('uncertain');
   const checkpoint=async(status:string,response:any)=>{const version=(await db.query<{v:string}>('select updated_at::text as v from public.catalog_submissions where id=$1::uuid',[id])).rows[0].v;return db.query('select public.checkpoint_ebay_family_submission($1::uuid,$2::uuid,$3::uuid,$4::timestamptz,$5,$6::jsonb)',[owner,org,id,version,status,JSON.stringify(response)]);};
   await expect(checkpoint('accepted',{offers:{RED:'1'},listing_id:'3'})).rejects.toThrow('All offer IDs');expect((await db.query<{status:string}>('select status from public.catalog_submissions')).rows.every(row=>row.status==='submitting')).toBe(true);
   await checkpoint('unknown',{stage:'offer_request_started',offers:{RED:'1'},listing_id:null});await expect(reserve()).rejects.toThrow('uncertain');
   await checkpoint('published',{stage:'readback_verified',offers:{RED:'1',BLUE:'2'},listing_id:'3'});expect((await db.query<{status:string}>('select status from public.catalog_submissions')).rows.every(row=>row.status==='published')).toBe(true);
   await expect(checkpoint('submitting',{offers:{RED:'1',BLUE:'2'},listing_id:'3'})).rejects.toThrow('regress');
   expect((await db.query<{client:boolean}>('select has_function_privilege(\'authenticated\',\'public.reserve_ebay_family_submission(uuid,uuid,text,jsonb,jsonb,jsonb)\',\'execute\') as client')).rows[0].client).toBe(false);
  }finally{await db.close();}
 },20000);
});
