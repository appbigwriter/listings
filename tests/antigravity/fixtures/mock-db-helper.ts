import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';

export async function createIsolatedTestDatabase(): Promise<PGlite> {
  const db = new PGlite();
  await db.exec(`
    create role anon;
    create role authenticated;
    create role service_role bypassrls;
    create schema auth;
    grant usage on schema auth to authenticated;
    create function auth.uid() returns uuid language sql stable as $$ select (current_setting('request.jwt.claims', true)::jsonb->>'sub')::uuid $$;
    create function auth.jwt() returns jsonb language sql stable as $$ select current_setting('request.jwt.claims', true)::jsonb $$;
  `);

  await db.exec(`
    create table public.prelistings(
      id uuid primary key default gen_random_uuid(),
      sku text unique,
      title text,
      status text default 'draft',
      payload jsonb default '{}',
      updated_at timestamptz default now()
    );
  `);

  await db.exec(`
    create table auth.sessions(id uuid primary key, user_id uuid);
    create table product_marketing_profiles(
      id uuid primary key default gen_random_uuid(),
      prelisting_id uuid,
      sku text,
      updated_at timestamptz default now(),
      status text,
      approval_notes text
    );
  `);

  for (const table of ['amazon_campaign_plans', 'meta_campaign_plans', 'tracking_plans', 'marketing_tasks', 'marketing_approvals']) {
    await db.exec(`
      create table ${table}(
        id uuid primary key default gen_random_uuid(),
        marketing_profile_id uuid,
        sku text,
        task_type text,
        updated_at timestamptz default now()
      );
    `);
  }

  await db.exec('alter table marketing_approvals add decision text, add approver text, add comments text, add created_at timestamptz;');
  await db.exec('grant all on product_marketing_profiles, marketing_tasks to authenticated, anon;');
  await db.exec('create schema storage; create table storage.buckets(id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);');

  const migrations = readdirSync('supabase/migrations').filter((name) => /^\d{14}_.+\.sql$/.test(name)).sort();
  for (const filename of migrations) {
    const sql = readFileSync(`supabase/migrations/${filename}`, 'utf8');
    if (!sql.trim()) throw new Error(`Empty migration: ${filename}`);
    await db.exec(sql);
    if (filename.endsWith('_catalog_pipeline.sql')) {
      await db.exec('grant all on public.catalog_jobs, public.catalog_submissions to authenticated;');
    }
  }

  return db;
}
