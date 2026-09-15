-- Tenant-safe, owner-only closing migration.
-- LOCAL-ONLY DOCUMENT: do not apply remotely from this repository. Run only after
-- an approved, authenticated backfill has mapped every existing row to its real owner/org.
create extension if not exists pgcrypto;

-- Preflight MUST be the first schema check. Do not move any ALTER TABLE above it:
-- missing tables abort with the complete list instead of a generic relation error.
DO $$
DECLARE
  t text;
  missing_tables text[] := ARRAY[]::text[];
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'prelistings','product_marketing_profiles','amazon_campaign_plans',
    'meta_campaign_plans','tracking_plans','marketing_tasks','marketing_approvals'
  ] LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      missing_tables := array_append(missing_tables, 'public.' || t);
    END IF;
  END LOOP;
  IF cardinality(missing_tables) > 0 THEN
    RAISE EXCEPTION 'SAFE_MIGRATION_ABORTED: required tables missing: %; inspect schema before applying', array_to_string(missing_tables, ', ');
  END IF;
END $$;

-- Add tenant and lifecycle columns only after every required table exists.
alter table public.prelistings add column if not exists owner_id uuid;
alter table public.prelistings add column if not exists organization_id uuid;
alter table public.prelistings add column if not exists archived_at timestamptz;
alter table public.prelistings add column if not exists template_key text;
alter table public.prelistings add column if not exists template_version text;
alter table public.prelistings add column if not exists human_reviewed boolean not null default false;
alter table public.prelistings add column if not exists submission jsonb not null default '{"status":"not_submitted","publication_status":"not_published"}'::jsonb;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['product_marketing_profiles','amazon_campaign_plans','meta_campaign_plans','tracking_plans','marketing_tasks','marketing_approvals'] LOOP
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS owner_id uuid', t);
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS organization_id uuid', t);
  END LOOP;
END $$;

-- Existing rows require an authenticated backfill owner_id and organization_id;
-- never guess identities. Verify NULLs before adding NOT NULL constraints.
DO $$
DECLARE
  t text;
  missing_count bigint;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'prelistings','product_marketing_profiles','amazon_campaign_plans',
    'meta_campaign_plans','tracking_plans','marketing_tasks','marketing_approvals'
  ] LOOP
    EXECUTE format('SELECT count(*) FROM public.%I WHERE owner_id IS NULL OR organization_id IS NULL', t) INTO missing_count;
    IF missing_count > 0 THEN
      RAISE EXCEPTION 'SAFE_MIGRATION_ABORTED: public.% has % rows with NULL owner_id or organization_id. Backfill each row from an authenticated, reliable existing mapping, then rerun; never invent an owner.', t, missing_count;
    END IF;
  END LOOP;
END $$;

alter table public.prelistings alter column owner_id set not null;
alter table public.prelistings alter column organization_id set not null;

-- The original schema has globally unique SKU. Owner-only isolation uses org-scoped SKU.
alter table public.prelistings drop constraint if exists prelistings_sku_key;
create unique index if not exists prelistings_org_sku_idx on public.prelistings(organization_id, sku);
create index if not exists prelistings_owner_idx on public.prelistings(owner_id, updated_at desc);
create index if not exists prelistings_org_idx on public.prelistings(organization_id, updated_at desc);

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.prelistings'::regclass AND conname = 'prelistings_status_check') THEN
    ALTER TABLE public.prelistings DROP CONSTRAINT prelistings_status_check;
  END IF;
  ALTER TABLE public.prelistings ADD CONSTRAINT prelistings_status_check CHECK (status IN ('draft','ready','exported','archived'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
alter table public.prelistings enable row level security;
drop policy if exists prelistings_tenant_access on public.prelistings;
drop policy if exists prelistings_owner_access on public.prelistings;
create policy prelistings_owner_access on public.prelistings for all
  using (owner_id = auth.uid() and organization_id = (auth.jwt()->>'organization_id')::uuid)
  with check (owner_id = auth.uid() and organization_id = (auth.jwt()->>'organization_id')::uuid);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['product_marketing_profiles','amazon_campaign_plans','meta_campaign_plans','tracking_plans','marketing_tasks','marketing_approvals'] LOOP
    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN owner_id SET NOT NULL', t);
    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN organization_id SET NOT NULL', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_tenant_access', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_owner_access', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL USING (owner_id = auth.uid() AND organization_id = (auth.jwt()->>''organization_id'')::uuid) WITH CHECK (owner_id = auth.uid() AND organization_id = (auth.jwt()->>''organization_id'')::uuid)', t || '_owner_access', t);
  END LOOP;
END $$;
alter table public.marketing_tasks add column if not exists idempotency_key text;
create unique index if not exists marketing_tasks_idempotency_idx on public.marketing_tasks(organization_id, idempotency_key, task_type);
