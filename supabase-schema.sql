create extension if not exists pgcrypto;
create table if not exists public.prelistings (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  organization_id uuid not null,
  sku text not null,
  title text not null,
  brand text not null default 'FBRSigns',
  payload jsonb not null default '{}'::jsonb,
  source_url text,
  source_platform text,
  source_snapshot jsonb,
  status text not null default 'draft' check (status in ('draft','ready','exported','archived')),
  archived_at timestamptz,
  template_key text,
  template_version text,
  human_reviewed boolean not null default false,
  submission jsonb not null default '{"status":"not_submitted","publication_status":"not_published"}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, sku)
);
create index if not exists prelistings_sku_idx on public.prelistings (sku);
create index if not exists prelistings_status_idx on public.prelistings (status);
create index if not exists prelistings_owner_idx on public.prelistings (owner_id, updated_at desc);
create index if not exists prelistings_org_idx on public.prelistings (organization_id, updated_at desc);

alter table public.prelistings enable row level security;
drop policy if exists prelistings_owner_access on public.prelistings;
create policy prelistings_owner_access on public.prelistings for all
  using (owner_id = auth.uid() and organization_id = (auth.jwt()->>'organization_id')::uuid)
  with check (owner_id = auth.uid() and organization_id = (auth.jwt()->>'organization_id')::uuid);
