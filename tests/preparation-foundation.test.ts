import {describe,expect,it} from 'vitest';
import {createIsolatedTestDatabase} from './antigravity/fixtures/mock-db-helper';
const owner='00000000-0000-4000-8000-000000000001',org='00000000-0000-4000-8000-000000000002';
describe('preparation foundation schema',()=>{
 it('stores field states, grouped exceptions, rules and channel readiness with tenant ownership',async()=>{
  const db=await createIsolatedTestDatabase();try{
   const group=(await db.query<{id:string}>('insert into public.catalog_exception_groups(owner_id,organization_id,fingerprint,code,severity,message,action,impact_count) values($1::uuid,$2::uuid,$3,$4,$5,$6,$7,$8) returning id',[owner,org,'a'.repeat(64),'material_missing','error','Material não confirmado','Confirmar material',3])).rows[0].id;
   await db.query('insert into public.catalog_field_states(owner_id,organization_id,sku,channel,scope_type,scope_key,field_path,state,value,source,confidence,evidence) values($1::uuid,$2::uuid,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11,$12::jsonb)',[owner,org,'SKU-1','amazon-us','product','SKU-1','material','suggested',JSON.stringify('aluminum'),JSON.stringify({source:'store'}),.82,JSON.stringify([{kind:'url'}])]);
   await db.query('insert into public.catalog_exceptions(group_id,owner_id,organization_id,sku,observed_version) values($1,$2::uuid,$3::uuid,$4,$5)',[group,owner,org,'SKU-1','v1']);
   await db.query('insert into public.catalog_preparation_rules(owner_id,organization_id,scope_type,scope_key,channel,field_path,value,status,evidence) values($1::uuid,$2::uuid,$3,$4,$5,$6,$7::jsonb,$8,$9::jsonb)',[owner,org,'family','FAMILY-1','amazon-us','material',JSON.stringify('aluminum'),'active',JSON.stringify([{source:'operator'}])]);
   await db.query('insert into public.catalog_channel_readiness(owner_id,organization_id,sku,channel,status,blockers,next_action,inputs_hash) values($1::uuid,$2::uuid,$3,$4,$5,$6::jsonb,$7,$8)',[owner,org,'SKU-1','amazon-us','needs_evidence',JSON.stringify([{code:'gtin_missing'}]),'Confirmar GTIN','b'.repeat(64)]);
   
   expect((await db.query<{count:number}>('select count(*)::int as count from public.catalog_field_states')).rows[0].count).toBe(1);
   expect((await db.query<{count:number}>('select count(*)::int as count from public.catalog_channel_readiness')).rows[0].count).toBe(1);
   await expect(db.query('insert into public.catalog_field_states(owner_id,organization_id,sku,channel,scope_type,scope_key,field_path,state,source,evidence) values($1::uuid,$2::uuid,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb)',[owner,org,'FOREIGN','amazon-us','product','FOREIGN','x','invalid',JSON.stringify({}),JSON.stringify([])])).rejects.toThrow();
  }finally{await db.close();}
 },20000);
});
