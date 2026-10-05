-- Additive migration: no existing catalog rows are rewritten.
begin;
create table public.catalog_jobs (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null, organization_id uuid not null,
  kind text not null check (kind in ('import','classify','generate','validate','media','monitor')),
  status text not null default 'pending' check (status in ('pending','running','completed','cancelled','failed')),
  idempotency_key text not null, payload jsonb not null, total integer not null check (total > 0 and total <= 5000),
  cursor integer not null default 0 check (cursor >= 0), attempts integer not null default 0,
  results jsonb not null default '[]'::jsonb, lease_token uuid, lease_until timestamptz,
  next_attempt_at timestamptz not null default now(), created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (organization_id, owner_id, idempotency_key)
);
create index catalog_jobs_pending_idx on public.catalog_jobs(status, next_attempt_at);
create index catalog_jobs_owner_idx on public.catalog_jobs(organization_id, owner_id, created_at desc);
alter table public.catalog_jobs enable row level security;
create policy catalog_jobs_owner_access on public.catalog_jobs for select to authenticated
  using (owner_id = (select auth.uid()) and organization_id = coalesce((auth.jwt()->'app_metadata'->>'organization_id')::uuid, (select auth.uid())));
grant select on public.catalog_jobs to authenticated;
grant select, insert, update, delete on public.catalog_jobs to service_role;
revoke all on public.catalog_jobs from anon;
create table public.catalog_submissions (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null, organization_id uuid not null,
  sku text not null, channel text not null, request_hash text not null,
  status text not null check (status in ('submitting','unknown','accepted','rejected','published','processing')),
  response jsonb, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (organization_id, owner_id, sku, channel, request_hash)
);
alter table public.catalog_submissions enable row level security;
create policy catalog_submissions_owner_access on public.catalog_submissions for select to authenticated
  using (owner_id = (select auth.uid()) and organization_id = coalesce((auth.jwt()->'app_metadata'->>'organization_id')::uuid, (select auth.uid())));
grant select on public.catalog_submissions to authenticated;
grant select, insert, update, delete on public.catalog_submissions to service_role;
revoke all on public.catalog_submissions from anon;
commit;
