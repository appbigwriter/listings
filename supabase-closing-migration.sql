-- PRD-002 closing migration. Apply only after auth provider and organization claims are configured.
alter table public.prelistings add column if not exists owner_id uuid;
alter table public.prelistings add column if not exists organization_id uuid;
alter table public.prelistings add column if not exists archived_at timestamptz;
alter table public.prelistings add column if not exists template_key text;
alter table public.prelistings add column if not exists template_version text;
alter table public.prelistings add column if not exists human_reviewed boolean not null default false;
alter table public.prelistings add column if not exists submission jsonb not null default '{"status":"not_submitted","publication_status":"not_published"}'::jsonb;
create index if not exists prelistings_owner_idx on public.prelistings(owner_id, updated_at desc);
create index if not exists prelistings_org_idx on public.prelistings(organization_id, updated_at desc);
alter table public.prelistings enable row level security;
drop policy if exists prelistings_owner_select on public.prelistings;
drop policy if exists prelistings_owner_write on public.prelistings;
create policy prelistings_owner_select on public.prelistings for select using (owner_id = auth.uid() or organization_id = (auth.jwt()->>'organization_id')::uuid);
create policy prelistings_owner_write on public.prelistings for all using (owner_id = auth.uid() or organization_id = (auth.jwt()->>'organization_id')::uuid) with check (owner_id = auth.uid() or organization_id = (auth.jwt()->>'organization_id')::uuid);
-- Service role remains server-only; apply equivalent owner/org columns and RLS to marketing tables in the same deployment.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['product_marketing_profiles','amazon_campaign_plans','meta_campaign_plans','tracking_plans','marketing_tasks','marketing_approvals'] LOOP
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS owner_id uuid', t);
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS organization_id uuid', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_tenant_access', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL USING (owner_id = auth.uid() OR organization_id = (auth.jwt()->>''organization_id'')::uuid) WITH CHECK (owner_id = auth.uid() OR organization_id = (auth.jwt()->>''organization_id'')::uuid)', t || '_tenant_access', t);
  END LOOP;
END $$;
