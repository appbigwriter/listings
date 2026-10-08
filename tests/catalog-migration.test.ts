import { PGlite } from '@electric-sql/pglite';
import { readFileSync,readdirSync } from 'node:fs';
import { beforeAll, afterAll, describe, expect, it } from 'vitest';

const userA = '00000000-0000-4000-8000-000000000001';
const userB = '00000000-0000-4000-8000-000000000002';
let db: PGlite;
describe('catalog SQL migration on local PostgreSQL', () => {
  beforeAll(async () => {
    db = new PGlite();
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls; create schema auth; grant usage on schema auth to authenticated;
      create function auth.uid() returns uuid language sql stable as $$ select (current_setting('request.jwt.claims', true)::jsonb->>'sub')::uuid $$;
      create function auth.jwt() returns jsonb language sql stable as $$ select current_setting('request.jwt.claims', true)::jsonb $$;`);
    await db.exec(`create table public.prelistings(id uuid primary key default gen_random_uuid(), sku text unique, title text, status text default 'draft', payload jsonb default '{}', updated_at timestamptz default now());
      insert into public.prelistings(sku,title) values ('LEGACY','Preserved');`);
    await db.exec(`create table auth.sessions(id uuid primary key,user_id uuid);
      create table product_marketing_profiles(id uuid primary key default gen_random_uuid(),prelisting_id uuid,sku text,updated_at timestamptz default now(),status text,approval_notes text);
      insert into product_marketing_profiles(sku) values ('OLD-MARKETING');`);
    for(const table of ['amazon_campaign_plans','meta_campaign_plans','tracking_plans','marketing_tasks','marketing_approvals'])await db.exec(`create table ${table}(id uuid primary key default gen_random_uuid(),marketing_profile_id uuid,sku text,task_type text,updated_at timestamptz default now())`);
    await db.exec('alter table marketing_approvals add decision text,add approver text,add comments text,add created_at timestamptz');
    await db.exec('grant all on product_marketing_profiles, marketing_tasks to authenticated, anon');
    await db.exec('create schema storage; create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[])');
    const migrations=readdirSync('supabase/migrations').filter(name=>/^\d{14}_.+\.sql$/.test(name)).sort();
    for(const filename of migrations){
      const sql=readFileSync('supabase/migrations/'+filename,'utf8');if(!sql.trim())throw new Error('Empty migration: '+filename);
      await db.exec(sql);
      // Reproduce broad remote defaults before the explicit-grants migration.
      if(filename.endsWith('_catalog_pipeline.sql'))await db.exec('grant all on public.catalog_jobs, public.catalog_submissions to authenticated');
    }
  }, 30000);
  afterAll(async () => { await db?.close(); });
  it('binds child claims to the exact locked parent version and approval',async()=>{
    await db.exec('begin');try{
      const approved='a'.repeat(64),parentPayload={relationship:'Parent',_catalog:{channels:{'amazon-us':{approval:{hash:approved}}}}},childPayload={relationship:'Child',parent_sku:'CLAIM-PARENT'};
      await db.query(`insert into prelistings(sku,title,owner_id,organization_id,payload) values('CLAIM-PARENT','Parent',$1,$1,$2),('CLAIM-CHILD','Child',$1,$1,$3)`,[userA,JSON.stringify(parentPayload),JSON.stringify(childPayload)]);
      const versions=(await db.query<{sku:string;updated_at:Date}>(`select sku,updated_at from prelistings where sku in ('CLAIM-PARENT','CLAIM-CHILD')`)).rows;
      const family={sku:'CLAIM-PARENT',updated_at:new Date(versions.find(row=>row.sku==='CLAIM-PARENT')!.updated_at).toISOString(),content_hash:approved};
      const args=[userA,userA,'CLAIM-CHILD','amazon-us',new Date(versions.find(row=>row.sku==='CLAIM-CHILD')!.updated_at).toISOString(),'b'.repeat(64),JSON.stringify({productType:'SIGN',attributes:{}})];
      const target={seller_id:'SELLER',marketplace_id:'US',operation:'listing_put',family};
      await db.exec('set role service_role');await db.exec('savepoint no_parent');
      await expect(db.query('select reserve_catalog_channel_submission($1,$2,$3,$4,$5,$6,$7,$8)',[...args,JSON.stringify({...target,family:undefined})])).rejects.toThrow('Parent version proof');await db.exec('rollback to savepoint no_parent');
      await db.exec('savepoint valid');expect((await db.query<{id:string}>('select reserve_catalog_channel_submission($1,$2,$3,$4,$5,$6,$7,$8) id',[...args,JSON.stringify(target)])).rows[0].id).toBeTruthy();await db.exec('rollback to savepoint valid');
      await db.exec(`update prelistings set updated_at=updated_at+interval '1 millisecond' where sku='CLAIM-PARENT'`);await db.exec('savepoint changed_parent');
      await expect(db.query('select reserve_catalog_channel_submission($1,$2,$3,$4,$5,$6,$7,$8)',[...args,JSON.stringify(target)])).rejects.toThrow('Parent version or approval changed');await db.exec('rollback to savepoint changed_parent');
      expect((await db.query(`select id from catalog_submissions where sku='CLAIM-CHILD'`)).rows).toHaveLength(0);
    }finally{await db.exec('rollback');await db.exec('reset role');}
  });
  it('persists attribution configuration without claiming eligibility or a verified conversion',async()=>{
    await db.exec('begin');
    try{
      await db.query("insert into tracking_plans(sku,owner_id,organization_id,attribution_tag,attribution_status) values('ATTRIBUTION',$1,$1,'tag-config','configured_unverified')",[userB]);
      expect((await db.query("select attribution_tag,attribution_status from tracking_plans where sku='ATTRIBUTION'")).rows).toEqual([{attribution_tag:'tag-config',attribution_status:'configured_unverified'}]);
      await db.exec('savepoint false_eligibility');await expect(db.query("update tracking_plans set attribution_status='available' where sku='ATTRIBUTION'")).rejects.toThrow();await db.exec('rollback to savepoint false_eligibility');
      await db.exec('savepoint missing_tag');await expect(db.query("update tracking_plans set attribution_tag=null where sku='ATTRIBUTION'")).rejects.toThrow();await db.exec('rollback to savepoint missing_tag');
    }finally{await db.exec('rollback');}
  });
  it('archives deliberately, blocks uncertain sends and restores without old approval',async()=>{
    await db.exec('begin');
    try{
      const row=(await db.query<{updated_at:Date}>(`insert into prelistings(sku,title,owner_id,organization_id,human_reviewed,payload) values('ARCHIVE-CAS','Review',$1,$1,true,'{"_catalog":{"channels":{"amazon-us":{"approval":{"hash":"old"},"report":{"ready":true},"category":"SIGN"}}}}') returning updated_at`,[userA])).rows[0];
      const args=[userA,userA,'ARCHIVE-CAS',new Date(row.updated_at).toISOString(),true,'Product absent from reviewed source'];
      await db.query("insert into catalog_submissions(owner_id,organization_id,sku,channel,request_hash,status) values($1,$1,'ARCHIVE-CAS','amazon-us','archive-hash','unknown')",[userA]);
      await db.exec('savepoint uncertain_archive');await expect(db.query('select set_catalog_archive($1,$2,$3,$4,$5,$6)',args)).rejects.toThrow('Reconcile');await db.exec('rollback to savepoint uncertain_archive');
      await db.query("update catalog_submissions set status='rejected' where sku='ARCHIVE-CAS'");
      const archived=(await db.query<{result:any}>('select set_catalog_archive($1,$2,$3,$4,$5,$6) result',args)).rows[0].result;expect(archived.status).toBe('archived');
      await db.exec('savepoint stale_restore');await expect(db.query('select set_catalog_archive($1,$2,$3,$4,$5,$6)',[...args.slice(0,4),false,'Restore reviewed product'])).rejects.toThrow('Product version changed');await db.exec('rollback to savepoint stale_restore');
      const restored=(await db.query<{result:any}>('select set_catalog_archive($1,$2,$3,$4,$5,$6) result',[...args.slice(0,3),archived.updated_at,false,'Restore reviewed product'])).rows[0].result;expect(restored.status).toBe('draft');expect(restored.archived_at).toBeNull();
      const product=(await db.query<{human_reviewed:boolean,payload:any}>("select human_reviewed,payload from prelistings where sku='ARCHIVE-CAS'")).rows[0];expect(product.human_reviewed).toBe(false);expect(product.payload._catalog.channels['amazon-us']).toEqual({category:'SIGN'});expect(product.payload.archive_transition).toMatchObject({actor:userA,archived:false,reason:'Restore reviewed product'});
      expect((await db.query("select has_function_privilege('authenticated','set_catalog_archive(uuid,uuid,text,timestamptz,boolean,text)','EXECUTE') allowed")).rows).toEqual([{allowed:false}]);
    }finally{await db.exec('rollback');}
  });
  it('reserves Amazon PUT/PATCH only for the owned current version and explicit offer authority',async()=>{
    await db.exec('begin');
    try{
      const row=(await db.query<{updated_at:Date}>("insert into prelistings(sku,title,owner_id,organization_id) values('AMAZON-CAS','Current',$1,$1) returning updated_at",[userA])).rows[0];
      const version=new Date(row.updated_at).toISOString();
      const args=[userA,userA,'AMAZON-CAS','amazon-us',version,'c'.repeat(64),JSON.stringify({productType:'SIGN',attributes:{item_name:[{value:'Current'}]}}),JSON.stringify({seller_id:'SELLER',marketplace_id:'ATVPDKIKX0DER',operation:'listing_put'})];
      await db.exec('savepoint stale_put');await expect(db.query('select reserve_catalog_channel_submission($1,$2,$3,$4,$5,$6,$7,$8)',[...args.slice(0,4),'2000-01-01T00:00:00Z',...args.slice(5)])).rejects.toThrow('Product version changed');await db.exec('rollback to savepoint stale_put');
      await db.exec('savepoint missing_authority');await expect(db.query('select reserve_catalog_channel_submission($1,$2,$3,$4,$5,$6,$7,$8)',[...args.slice(0,7),JSON.stringify({seller_id:'SELLER',marketplace_id:'ATVPDKIKX0DER',operation:'offer_patch'})])).rejects.toThrow('Offer authority required');await db.exec('rollback to savepoint missing_authority');
      const id=(await db.query<{id:string}>('select reserve_catalog_channel_submission($1,$2,$3,$4,$5,$6,$7,$8) id',args)).rows[0].id;expect(id).toBeTruthy();
      await db.query("update catalog_submissions set status='unknown' where id=$1",[id]);
      await db.exec('savepoint uncertain_put');await expect(db.query('select reserve_catalog_channel_submission($1,$2,$3,$4,$5,$6,$7,$8)',[...args.slice(0,5),'d'.repeat(64),...args.slice(6)])).rejects.toThrow('uncertain submission');await db.exec('rollback to savepoint uncertain_put');
    }finally{await db.exec('rollback');}
  });
  it('records marketing approval and status atomically only for the reviewed versions',async()=>{
    await db.exec('begin');
    try{
      const listing=(await db.query<{updated_at:Date}>("insert into prelistings(sku,title,owner_id,organization_id) values('MARKETING-CAS','Review',$1,$1) returning updated_at",[userB])).rows[0];
      const profile=(await db.query<{id:string,updated_at:Date}>("insert into product_marketing_profiles(sku,owner_id,organization_id,status) values('MARKETING-CAS',$1,$1,'draft') returning id,updated_at",[userB])).rows[0];
      const versions={listing:new Date(listing.updated_at).toISOString(),profile:new Date(profile.updated_at).toISOString(),amazon:null,meta:null,tracking:null};
      const record={sku:'MARKETING-CAS',owner_id:userB,organization_id:userB,approver:userB,decision:'approved',comments:'Reviewed',created_at:new Date().toISOString(),content_hash:'a'.repeat(64),signature:'b'.repeat(64)};
      const args=[userB,userB,record.sku,profile.id,JSON.stringify(record),'{}',JSON.stringify(versions)];
      await db.query('insert into amazon_campaign_plans(marketing_profile_id,sku,owner_id,organization_id) values($1,$2,$3,$3)',[profile.id,record.sku,userB]);
      await db.exec('savepoint changed_plan');await expect(db.query('select record_marketing_approval($1,$2,$3,$4,$5,$6,$7)',args)).rejects.toThrow('Marketing plan version changed');await db.exec('rollback to savepoint changed_plan');
      expect((await db.query('select status from product_marketing_profiles where id=$1',[profile.id])).rows).toEqual([{status:'draft'}]);
      expect((await db.query('select id from marketing_approvals where sku=$1',[record.sku])).rows).toEqual([]);
      await db.query('delete from amazon_campaign_plans where marketing_profile_id=$1',[profile.id]);
      expect((await db.query('select record_marketing_approval($1,$2,$3,$4,$5,$6,$7) id',args)).rows[0]).toHaveProperty('id');
      expect((await db.query('select status from product_marketing_profiles where id=$1',[profile.id])).rows).toEqual([{status:'launch_ready'}]);
      expect((await db.query('select content_hash,snapshot from marketing_approvals where sku=$1',[record.sku])).rows).toEqual([{content_hash:record.content_hash,snapshot:{}}]);
      expect((await db.query("select has_function_privilege('authenticated','record_marketing_approval(uuid,uuid,text,uuid,jsonb,jsonb,jsonb)','EXECUTE') allowed")).rows).toEqual([{allowed:false}]);
    }finally{await db.exec('rollback');}
  });
  it('reserves eBay only at the current owner/version and blocks a second uncertain SKU version',async()=>{
    await db.exec('begin');
    try {
      const row=(await db.query<{updated_at:Date}>("insert into prelistings(sku,title,owner_id,organization_id) values('EBAY-CLAIM','eBay',$1,$1) returning updated_at",[userB])).rows[0];
      const args=[userB,userB,'EBAY-CLAIM','ebay-us',new Date(row.updated_at).toISOString(),'a'.repeat(64),JSON.stringify({inventory:{},offer:{sku:'EBAY-CLAIM'}}),JSON.stringify({account_id:'ACCOUNT',marketplace_id:'EBAY_US'})];
      await db.exec('savepoint stale_channel_version');await expect(db.query('select reserve_catalog_channel_submission($1,$2,$3,$4,$5,$6,$7,$8)',[...args.slice(0,4),'2000-01-01T00:00:00Z',...args.slice(5)])).rejects.toThrow();await db.exec('rollback to savepoint stale_channel_version');
      expect((await db.query<{id:string}>('select reserve_catalog_channel_submission($1,$2,$3,$4,$5,$6,$7,$8) id',args)).rows[0].id).toBeTruthy();
      await db.exec('savepoint uncertain_channel_version');await expect(db.query('select reserve_catalog_channel_submission($1,$2,$3,$4,$5,$6,$7,$8)',[...args.slice(0,5),'b'.repeat(64),...args.slice(6)])).rejects.toThrow();await db.exec('rollback to savepoint uncertain_channel_version');
      expect((await db.query("select has_function_privilege('authenticated','reserve_catalog_channel_submission(uuid,uuid,text,text,timestamptz,text,jsonb,jsonb)','EXECUTE') as allowed")).rows).toEqual([{allowed:false}]);
    }finally{await db.exec('rollback');}
  });
  it('commits feed outcome and projection together and never downgrades a reconciled claim',async()=>{
    await db.exec('begin');
    try {
      const product=await db.query<{updated_at:Date}>(`insert into prelistings(sku,title,payload,owner_id,organization_id) values('ATOMIC-FEED','Atomic','{"_catalog":{"channels":{"amazon-us":{}}},"material":"Steel"}',$1,$1) returning updated_at`,[userB]);
      const version=new Date(product.rows[0].updated_at).toISOString(),lease='00000000-0000-4000-8000-000000000085';
      const batch=(await db.query<{id:string}>(`insert into catalog_feeds(owner_id,organization_id,manifest_hash,payload,manifest,target,status,feed_id,lease_token,lease_until) values($1,$1,'atomic-manifest','{}','[]','{}','processing','123',$2,now()+interval '1 minute') returning id`,[userB,lease])).rows[0].id;
      await db.query(`insert into catalog_submissions(owner_id,organization_id,sku,channel,request_hash,status,feed_batch_id) values($1,$1,'ATOMIC-FEED','amazon-us','atomic-hash','submitting',$2)`,[userB,batch]);
      const submission={status:'accepted',request_hash:'atomic-hash',response:{feed_id:'123'}};
      const args=[userB,userB,batch,lease,'ATOMIC-FEED','atomic-hash','accepted','{}',version,JSON.stringify(submission)];
      await db.exec('savepoint bad_projection');await expect(db.query('select record_catalog_feed_outcome($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',[...args.slice(0,9),JSON.stringify({...submission,request_hash:'wrong'})])).rejects.toThrow();await db.exec('rollback to savepoint bad_projection');
      expect((await db.query("select status from catalog_submissions where sku='ATOMIC-FEED'")).rows).toEqual([{status:'submitting'}]);
      expect((await db.query<{result:any}>('select record_catalog_feed_outcome($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) result',args)).rows[0].result).toEqual({claim_updated:true,product_updated:true});
      expect((await db.query<{payload:any}>("select payload from prelistings where sku='ATOMIC-FEED'")).rows[0].payload).toMatchObject({material:'Steel',_catalog:{channels:{'amazon-us':{submission}}}});
      await db.query("update catalog_submissions set status='published' where sku='ATOMIC-FEED'");
      expect((await db.query<{result:any}>('select record_catalog_feed_outcome($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) result',args)).rows[0].result).toEqual({claim_updated:false,product_updated:false});
      expect((await db.query("select status from catalog_submissions where sku='ATOMIC-FEED'")).rows).toEqual([{status:'published'}]);
      await db.query("update catalog_submissions set status='unknown' where sku='ATOMIC-FEED'");
      await db.query("update prelistings set title='Newer human version',updated_at=now()+interval '1 hour' where sku='ATOMIC-FEED'");
      expect((await db.query<{result:any}>('select record_catalog_feed_outcome($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) result',args)).rows[0].result).toEqual({claim_updated:true,product_updated:false});
      expect((await db.query("select title from prelistings where sku='ATOMIC-FEED'")).rows).toEqual([{title:'Newer human version'}]);
      await db.exec('savepoint lost_lease');await expect(db.query('select record_catalog_feed_outcome($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',[...args.slice(0,3),'00000000-0000-4000-8000-000000000086',...args.slice(4)])).rejects.toThrow();await db.exec('rollback to savepoint lost_lease');
    }finally{await db.exec('rollback');}
  });
  it('allows an explicit new feed attempt only after every SKU proves a preflight failure',async()=>{
    await db.exec('begin');
    try {
      const product=await db.query<{updated_at:Date}>('insert into prelistings(sku,title,owner_id,organization_id) values ($1,$2,$3,$3) returning updated_at',['RETRY-FEED','Retry',userB]);
      const manifest=[{sku:'RETRY-FEED',hash:'retry-hash',updated_at:new Date(product.rows[0].updated_at).toISOString(),message_id:1}];
      const payload={messages:[{sku:'RETRY-FEED',attributes:{item_name:[{value:'Retry'}]}}]};
      const args=[userB,userB,'retry-manifest',JSON.stringify(manifest),JSON.stringify(payload),'{}'];
      const first=(await db.query<{id:string}>('select reserve_catalog_feed($1,$2,$3,$4,$5,$6) id',args)).rows[0].id;
      await db.query("update catalog_feeds set status='failed' where id=$1",[first]);
      await db.exec('savepoint uncertain_claim');
      await expect(db.query('select reserve_catalog_feed($1,$2,$3,$4,$5,$6,$7)',[...args,first])).rejects.toThrow();await db.exec('rollback to savepoint uncertain_claim');
      await db.query(`update catalog_submissions set status='rejected',response='{"external_started":false}' where feed_batch_id=$1`,[first]);
      const second=(await db.query<{id:string}>('select reserve_catalog_feed($1,$2,$3,$4,$5,$6,$7) id',[...args,first])).rows[0].id;
      expect((await db.query('select attempt_no,retry_of from catalog_feeds where id=$1',[second])).rows).toEqual([{attempt_no:2,retry_of:first}]);
      expect((await db.query('select status,attempt_no from catalog_submissions where sku=$1 order by attempt_no',['RETRY-FEED'])).rows).toEqual([{status:'rejected',attempt_no:1},{status:'submitting',attempt_no:2}]);
      await db.exec('savepoint duplicate_retry');await expect(db.query('select reserve_catalog_feed($1,$2,$3,$4,$5,$6,$7)',[...args,first])).rejects.toThrow();await db.exec('rollback to savepoint duplicate_retry');
      await db.query("update catalog_feeds set status='failed' where id=$1",[second]);await db.query(`update catalog_submissions set status='unknown',response='{"external_started":true}' where feed_batch_id=$1`,[second]);
      await db.exec('savepoint uncertain_external');await expect(db.query('select reserve_catalog_feed($1,$2,$3,$4,$5,$6,$7)',[...args,second])).rejects.toThrow();await db.exec('rollback to savepoint uncertain_external');
    }finally{await db.exec('rollback');}
  });
  it('isolates notifications, deduplicates delivery IDs and forbids client writes',async()=>{
    await db.exec('begin');
    try {
      const product=await db.query<{id:string}>('insert into prelistings(sku,title,owner_id,organization_id) values ($1,$2,$3,$3) returning id',['EVENT-SKU','Event',userA]);
      const values=[userA,product.rows[0].id,'a'.repeat(64)];
      await db.query(`insert into catalog_events(id,organization_id,owner_id,prelisting_id,sku,provider,notification_id,notification_type,event_time,payload_hash,payload) values(gen_random_uuid(),$1,$1,$2,'EVENT-SKU','amazon','notification-1','LISTINGS_ITEM_STATUS_CHANGE',now(),$3,'{}')`,values);
      await db.exec('savepoint duplicate_notification');
      await expect(db.query(`insert into catalog_events(id,organization_id,owner_id,prelisting_id,sku,provider,notification_id,notification_type,event_time,payload_hash,payload) values(gen_random_uuid(),$1,$1,$2,'EVENT-SKU','amazon','notification-1','LISTINGS_ITEM_STATUS_CHANGE',now(),$3,'{}')`,values)).rejects.toThrow();
      await db.exec('rollback to savepoint duplicate_notification');
      await db.exec(`set role authenticated; set request.jwt.claims='{"sub":"${userB}"}'`);
      expect((await db.query('select id from catalog_events')).rows).toEqual([]);await db.exec('reset role');
      expect((await db.query("select has_table_privilege('authenticated','catalog_events','INSERT') as allowed")).rows).toEqual([{allowed:false}]);
    }finally{await db.exec('reset role;rollback');}
  });
  it('shares monetary reservations across owners and releases failed reservations',async()=>{
    const organization='00000000-0000-4000-8000-000000000099';
    await db.exec('set role service_role');
    try {
      const reserve=async(owner:string)=>db.query<{id:string|null}>('select reserve_catalog_ai_operation_cost($1,$2,$3,$4,100,100,60,$5) as id',[owner,organization,'COST-SKU','generate',JSON.stringify({model:'fixture'})]);
      const first=await reserve(userA);expect(first.rows[0].id).not.toBeNull();
      await db.query("update catalog_ai_operations set status='failed' where id=$1",[first.rows[0].id]);
      expect((await reserve(userB)).rows[0].id).not.toBeNull();
    }finally{await db.exec('reset role');}
    expect((await db.query("select has_function_privilege('authenticated','reserve_catalog_ai_operation_cost(uuid,uuid,text,text,integer,bigint,bigint,jsonb)','EXECUTE') as allowed")).rows).toEqual([{allowed:false}]);
  });
  it('keeps evidence private, disallows client mutation and cross-owner product links',async()=>{
    await db.exec('begin');
    try {
    expect((await db.query("select public,file_size_limit from storage.buckets where id='prelisting-evidence'")).rows).toEqual([{public:false,file_size_limit:5000000}]);
    const product=await db.query<{id:string}>('insert into prelistings(sku,title,owner_id,organization_id) values ($1,$2,$3,$3) returning id',['ASSET-P','Asset',userA]);
    await db.exec('savepoint invalid_owner');
    await expect(db.query(`insert into catalog_assets(id,owner_id,organization_id,prelisting_id,sku,purpose,filename,mime_type,byte_size,sha256,object_path) values(gen_random_uuid(),$1,$1,$2,'ASSET-P','technical','file.pdf','application/pdf',10,$3,'wrong')`,[userB,product.rows[0].id,'a'.repeat(64)])).rejects.toThrow();
    await db.exec('rollback to savepoint invalid_owner');
    expect((await db.query("select has_table_privilege('authenticated','catalog_assets','INSERT') as client,has_table_privilege('anon','catalog_assets','SELECT') as anon,has_table_privilege('service_role','catalog_assets','TRUNCATE') as truncate")).rows).toEqual([{client:false,anon:false,truncate:false}]);
    }finally{await db.exec('rollback');}
  });
  it('preserves unowned legacy records, hides them from users and rejects new unowned records', async () => {
    expect((await db.query(`select title from prelistings where sku='LEGACY'`)).rows).toEqual([{ title: 'Preserved' }]);
    await expect(db.query(`insert into prelistings(sku,title) values ('UNOWNED','Denied')`)).rejects.toThrow();
    await db.query('select set_config($1, $2, false)', ['request.jwt.claims', JSON.stringify({ sub: userA, app_metadata: {} })]);
    await db.exec('set role authenticated');
    expect((await db.query('select * from prelistings')).rows).toHaveLength(0);
    await expect(db.query(`insert into prelistings(sku,title) values ('FORGED','Denied')`)).rejects.toThrow();
    await db.exec('reset role');
  });
  it('enforces owner and organization isolation, rejects ownership reassignment and duplicate job keys', async () => {
    await db.query('select set_config($1, $2, false)', ['request.jwt.claims', JSON.stringify({ sub: userA, app_metadata: { organization_id: userA } })]);
    await db.query('insert into catalog_jobs(owner_id,organization_id,kind,idempotency_key,payload,total) values ($1,$1,$2,$3,$4,1)', [userA, 'validate', 'key-a', JSON.stringify({ skus: ['A'] })]);
    await expect(db.query('insert into catalog_jobs(owner_id,organization_id,kind,idempotency_key,payload,total) values ($1,$1,$2,$3,$4,1)', [userA, 'validate', 'key-a', '{}'])).rejects.toThrow();
    await db.exec('set role authenticated');
    expect((await db.query('select * from catalog_jobs')).rows).toHaveLength(1);
    await expect(db.query('insert into catalog_jobs(owner_id,organization_id,kind,idempotency_key,payload,total) values ($1,$1,$2,$3,$4,1)', [userA, 'validate', 'forged', '{}'])).rejects.toThrow();
    await expect(db.query('update catalog_jobs set owner_id=$1', [userB])).rejects.toThrow();
    await db.query('select set_config($1, $2, false)', ['request.jwt.claims', JSON.stringify({ sub: userB, app_metadata: { organization_id: userB } })]);
    expect((await db.query('select * from catalog_jobs')).rows).toHaveLength(0);
    await expect(db.query('update catalog_jobs set status=$1 returning id', ['completed'])).rejects.toThrow();
    await db.exec('reset role');
  });
  it('prevents a second worker claiming an unexpired lease and prevents duplicate submissions', async () => {
    const first = await db.query(`update catalog_jobs set lease_token=gen_random_uuid(), lease_until=now()+interval '3 minutes' where idempotency_key='key-a' and (lease_until is null or lease_until<now()) returning id`);
    expect(first.rows).toHaveLength(1);
    expect((await db.query(`update catalog_jobs set lease_token=gen_random_uuid() where idempotency_key='key-a' and (lease_until is null or lease_until<now()) returning id`)).rows).toHaveLength(0);
    await db.query('insert into catalog_submissions(owner_id,organization_id,sku,channel,request_hash,status) values ($1,$1,$2,$3,$4,$5)', [userA, 'A', 'amazon-us', 'hash-a', 'submitting']);
    await expect(db.query('insert into catalog_submissions(owner_id,organization_id,sku,channel,request_hash,status) values ($1,$1,$2,$3,$4,$5)', [userA, 'A', 'amazon-us', 'hash-a', 'submitting'])).rejects.toThrow();
    await expect(db.query('insert into catalog_submissions(owner_id,organization_id,sku,channel,request_hash,status) values ($1,$1,$2,$3,$4,$5)', [userA, 'A', 'amazon-us', 'different-version', 'submitting'])).rejects.toThrow();
    await db.exec('set role authenticated');
    await expect(db.query('delete from catalog_submissions')).rejects.toThrow();
    await expect(db.exec('truncate catalog_submissions')).rejects.toThrow();
    await db.exec('reset role');
  });
  it('isolates marketing, preserves legacy and rejects cross-owner parent links', async () => {
    expect((await db.query("select sku from product_marketing_profiles where sku='OLD-MARKETING'")).rows).toHaveLength(1);
    await expect(db.exec("insert into product_marketing_profiles(sku) values ('UNOWNED')")).rejects.toThrow();
    const profile = await db.query<{id:string}>('insert into product_marketing_profiles(sku,owner_id,organization_id) values ($1,$2,$2) returning id', ['A',userA]);
    await expect(db.query('insert into marketing_tasks(sku,owner_id,organization_id,marketing_profile_id) values ($1,$2,$2,$3)', ['B',userB,profile.rows[0].id])).rejects.toThrow();
    await db.query('select set_config($1,$2,false)', ['request.jwt.claims',JSON.stringify({sub:userB,app_metadata:{}})]);
    await db.exec('set role authenticated');
    expect((await db.query('select * from product_marketing_profiles')).rows).toHaveLength(0);
    await expect(db.exec('truncate marketing_tasks')).rejects.toThrow();
    await db.exec('reset role');
  });
  it('checks session ownership and revocation without exposing auth tables', async () => {
    const session = '00000000-0000-4000-8000-000000000010';
    await db.query('insert into auth.sessions values ($1,$2)',[session,userA]);
    await db.query('select set_config($1,$2,false)', ['request.jwt.claims',JSON.stringify({sub:userA,session_id:session})]);
    await db.exec('set role authenticated');
    expect((await db.query<{active:boolean}>('select prelisting_session_active() active')).rows[0].active).toBe(true);
    await expect(db.exec('select * from auth.sessions')).rejects.toThrow();
    await db.exec('reset role');
    await db.exec('delete from auth.sessions');
    await db.exec('set role authenticated');
    expect((await db.query<{active:boolean}>('select prelisting_session_active() active')).rows[0].active).toBe(false);
    await db.exec('reset role');
  });
  it('captures changed product versions atomically and forbids rewriting history', async () => {
    await db.query('insert into prelistings(sku,title,owner_id,organization_id) values ($1,$2,$3,$3)', ['VERSIONED','First',userA]);
    await db.exec("update prelistings set title='Second' where sku='VERSIONED'");
    const history=await db.query<{snapshot:{title:string}}>("select snapshot from catalog_versions where sku='VERSIONED' order by created_at");
    expect(history.rows.map(row=>row.snapshot.title)).toEqual(['First','Second']);
    await db.exec('set role service_role');
    await expect(db.exec("update catalog_versions set fingerprint='forged'")).rejects.toThrow();
    await expect(db.exec('delete from catalog_versions')).rejects.toThrow();
    await db.exec('reset role');
  });
  it('reserves daily AI quota durably and denies client-side reservations', async () => {
    await db.exec('set role service_role');
    const args=[userA,userA,'A','generate',1];
    const first=await db.query<{id:string}>('select reserve_catalog_ai_operation($1,$2,$3,$4,$5) id',args);
    expect(first.rows[0].id).toBeTruthy();
    const second=await db.query<{id:null}>('select reserve_catalog_ai_operation($1,$2,$3,$4,$5) id',args);
    expect(second.rows[0].id).toBeNull();
    await db.exec('reset role'); await db.exec('set role authenticated');
    await expect(db.query('select reserve_catalog_ai_operation($1,$2,$3,$4,$5)',args)).rejects.toThrow();
    await db.exec('reset role');
  });
  it('reserves a feed atomically and rolls back all claims when one SKU conflicts',async()=>{
    await db.query('insert into prelistings(sku,title,owner_id,organization_id) values ($1,$2,$3,$3)', ['FEED-A','Sign',userA]);
    const row=(await db.query<{updated_at:Date|string}>("select updated_at from prelistings where sku='FEED-A'")).rows[0];
    const manifest=[{sku:'FEED-A',hash:'feed-a-hash',updated_at:new Date(row.updated_at).toISOString(),message_id:1}];
    const payload={header:{sellerId:'fixture'},messages:[{sku:'FEED-A',messageId:1,productType:'SIGN',attributes:{item_name:[{value:'Sign'}]}}]};
    const args=[userA,userA,'manifest-one',JSON.stringify(manifest),JSON.stringify(payload),JSON.stringify({seller_id:'fixture',marketplace_id:'US'})];
    await db.exec('set role service_role');
    const reserved=await db.query<{id:string}>('select reserve_catalog_feed($1,$2,$3,$4,$5,$6) id',args);expect(reserved.rows[0].id).toBeTruthy();
    await expect(db.query('select reserve_catalog_feed($1,$2,$3,$4,$5,$6)',[...args.slice(0,2),'manifest-two',...args.slice(3)])).rejects.toThrow();
    expect((await db.query('select * from catalog_feeds')).rows).toHaveLength(1);
    expect((await db.query("select * from catalog_submissions where sku='FEED-A'")).rows).toHaveLength(1);
    await db.exec('reset role');await db.exec('set role authenticated');
    await expect(db.query('select reserve_catalog_feed($1,$2,$3,$4,$5,$6)',args)).rejects.toThrow();await db.exec('reset role');
  });
});
