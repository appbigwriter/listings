-- MP-001 Marketing Readiness migration. Apply after the existing prelistings table.
create extension if not exists pgcrypto;
create table if not exists public.product_marketing_profiles (
 id uuid primary key default gen_random_uuid(), prelisting_id uuid references public.prelistings(id) on delete cascade,
 sku text not null unique, status text not null default 'draft' check (status in ('draft','research_ready','campaign_plan_ready','tracking_ready','approval_pending','launch_ready','launched','optimizing','paused')),
 objective text, audience jsonb not null default '{}'::jsonb, purchase_motivations jsonb not null default '[]'::jsonb, objections jsonb not null default '[]'::jsonb,
 approved_claims jsonb not null default '[]'::jsonb, prohibited_claims jsonb not null default '[]'::jsonb, economics jsonb not null default '{}'::jsonb,
 source_provenance jsonb not null default '{}'::jsonb, approval_notes text, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.amazon_campaign_plans (
 id uuid primary key default gen_random_uuid(), marketing_profile_id uuid not null references public.product_marketing_profiles(id) on delete cascade,
 sku text not null, status text not null default 'draft' check (status in ('draft','approved')), plan jsonb not null default '{}'::jsonb, approval_notes text, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(marketing_profile_id)
);
create table if not exists public.meta_campaign_plans (
 id uuid primary key default gen_random_uuid(), marketing_profile_id uuid not null references public.product_marketing_profiles(id) on delete cascade,
 sku text not null, status text not null default 'draft' check (status in ('draft','approved')), plan jsonb not null default '{}'::jsonb, approval_notes text, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(marketing_profile_id)
);
create table if not exists public.tracking_plans (
 id uuid primary key default gen_random_uuid(), marketing_profile_id uuid not null references public.product_marketing_profiles(id) on delete cascade,
 sku text not null, status text not null default 'draft' check (status in ('draft','approved')), events jsonb not null default '[]'::jsonb, utm_rules jsonb not null default '{}'::jsonb,
 destination_url text, notes text, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(marketing_profile_id)
);
create table if not exists public.marketing_tasks (
 id uuid primary key default gen_random_uuid(), marketing_profile_id uuid not null references public.product_marketing_profiles(id) on delete cascade,
 sku text not null, kanban_task_id text, agent text not null, task_type text not null, status text not null default 'pending', payload jsonb not null default '{}'::jsonb, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists marketing_tasks_sku_idx on public.marketing_tasks(sku);
create index if not exists marketing_profiles_status_idx on public.product_marketing_profiles(status);

create table if not exists public.marketing_approvals (
  id uuid primary key default gen_random_uuid(),
  marketing_profile_id uuid not null references public.product_marketing_profiles(id) on delete cascade,
  sku text not null,
  decision text not null check (decision in ('approved','rejected','changes_requested')),
  approver text not null,
  comments text not null,
  created_at timestamptz not null default now()
);
create index if not exists marketing_approvals_sku_idx on public.marketing_approvals(sku, created_at desc);
