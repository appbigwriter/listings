import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
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
    await db.exec(`create table public.prelistings(id uuid primary key default gen_random_uuid(), sku text unique, title text, payload jsonb default '{}', updated_at timestamptz default now());
      insert into public.prelistings(sku,title) values ('LEGACY','Preserved');`);
    await db.exec(readFileSync('supabase/migrations/20261005165617_catalog_foundation.sql', 'utf8'));
    await db.exec(readFileSync('supabase/migrations/20261005165628_catalog_pipeline.sql', 'utf8'));
    // Reproduce the live project's broad defaults, including privileges outside RLS.
    await db.exec('grant all on public.catalog_jobs, public.catalog_submissions to authenticated');
    await db.exec(readFileSync('supabase/migrations/20261005165800_catalog_explicit_grants.sql', 'utf8'));
    await db.exec(`create table auth.sessions(id uuid primary key,user_id uuid);
      create table product_marketing_profiles(id uuid primary key default gen_random_uuid(), prelisting_id uuid, sku text);
      insert into product_marketing_profiles(sku) values ('OLD-MARKETING');`);
    for (const table of ['amazon_campaign_plans','meta_campaign_plans','tracking_plans','marketing_tasks','marketing_approvals']) await db.exec(`create table ${table}(id uuid primary key default gen_random_uuid(),marketing_profile_id uuid,sku text,task_type text)`);
    await db.exec('grant all on product_marketing_profiles, marketing_tasks to authenticated, anon');
    await db.exec(readFileSync('supabase/migrations/20261005172255_operational_security.sql', 'utf8'));
    await db.exec(readFileSync('supabase/migrations/20261005173315_catalog_history.sql', 'utf8'));
    await db.exec(readFileSync('supabase/migrations/20261005173317_ai_operation_budget.sql', 'utf8'));
  }, 30000);
  afterAll(async () => { await db?.close(); });
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
});
