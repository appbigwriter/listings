begin;

create table public.catalog_field_states(
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null, organization_id uuid not null,
 sku text not null, channel text not null,
 scope_type text not null check(scope_type in ('product','family','rule')),
 scope_key text not null, field_path text not null,
 state text not null check(state in ('confirmed','suggested','inherited','not_found','conflicting','not_applicable')),
 value jsonb, source jsonb not null default '{}'::jsonb,
 confidence numeric(5,4) check(confidence is null or confidence between 0 and 1),
 evidence jsonb not null default '[]'::jsonb, observed_version text,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(organization_id,owner_id,sku,channel,scope_type,scope_key,field_path),
 check(jsonb_typeof(source)='object'),check(jsonb_typeof(evidence)='array')
);
create index catalog_field_states_scope_idx on public.catalog_field_states(organization_id,owner_id,channel,state,updated_at desc);

create table public.catalog_exception_groups(
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null, organization_id uuid not null,
 fingerprint text not null check(fingerprint~'^[a-f0-9]{64}$'),
 code text not null, field_path text, channel text,
 severity text not null check(severity in ('error','warning','info')),
 status text not null default 'open' check(status in ('open','in_progress','resolved','dismissed')),
 message text not null, action text not null, impact_count integer not null default 0 check(impact_count>=0),
 next_action text, observed_version text, assigned_to uuid,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), resolved_at timestamptz,
 unique(organization_id,owner_id,fingerprint)
);
create index catalog_exception_groups_queue_idx on public.catalog_exception_groups(organization_id,owner_id,status,severity,impact_count desc,updated_at desc);

create table public.catalog_exceptions(
 id uuid primary key default gen_random_uuid(), group_id uuid not null references public.catalog_exception_groups(id) on delete cascade,
 owner_id uuid not null, organization_id uuid not null, sku text not null, family_key text,
 status text not null default 'open' check(status in ('open','in_progress','resolved','dismissed')),
 observed_version text, resolution jsonb, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(group_id,sku)
);
create index catalog_exceptions_sku_idx on public.catalog_exceptions(organization_id,owner_id,sku,status);

create table public.catalog_preparation_rules(
 id uuid primary key default gen_random_uuid(), owner_id uuid not null, organization_id uuid not null,
 scope_type text not null check(scope_type in ('global','family','product')),
 scope_key text not null, channel text, field_path text not null, value jsonb not null,
 priority integer not null default 100 check(priority between 0 and 10000),
 status text not null default 'draft' check(status in ('draft','active','paused','expired')),
 evidence jsonb not null default '[]'::jsonb, approved_by uuid, valid_from timestamptz not null default now(), valid_until timestamptz,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(organization_id,owner_id,scope_type,scope_key,channel,field_path),
 check(jsonb_typeof(evidence)='array'),check(valid_until is null or valid_until>valid_from)
);
create index catalog_preparation_rules_lookup_idx on public.catalog_preparation_rules(organization_id,owner_id,scope_type,status,priority desc);

create table public.catalog_channel_readiness(
 id uuid primary key default gen_random_uuid(), owner_id uuid not null, organization_id uuid not null,
 sku text not null, channel text not null, status text not null check(status in ('draft','needs_evidence','needs_review','ready_for_review','approved','submitted','accepted','published','not_verified','rejected','excluded')),
 blockers jsonb not null default '[]'::jsonb, next_action text, inputs_hash text not null check(inputs_hash~'^[a-f0-9]{64}$'), schema_version text, evaluated_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(organization_id,owner_id,sku,channel),check(jsonb_typeof(blockers)='array')
);
create index catalog_channel_readiness_queue_idx on public.catalog_channel_readiness(organization_id,owner_id,channel,status,updated_at desc);

alter table public.catalog_field_states enable row level security;
alter table public.catalog_exception_groups enable row level security;
alter table public.catalog_exceptions enable row level security;
alter table public.catalog_preparation_rules enable row level security;
alter table public.catalog_channel_readiness enable row level security;

create policy catalog_field_states_owner_select on public.catalog_field_states for select to authenticated using(owner_id=(select auth.uid()) and organization_id=coalesce((auth.jwt()->'app_metadata'->>'organization_id')::uuid,(select auth.uid())));
create policy catalog_exception_groups_owner_select on public.catalog_exception_groups for select to authenticated using(owner_id=(select auth.uid()) and organization_id=coalesce((auth.jwt()->'app_metadata'->>'organization_id')::uuid,(select auth.uid())));
create policy catalog_exceptions_owner_select on public.catalog_exceptions for select to authenticated using(owner_id=(select auth.uid()) and organization_id=coalesce((auth.jwt()->'app_metadata'->>'organization_id')::uuid,(select auth.uid())));
create policy catalog_preparation_rules_owner_select on public.catalog_preparation_rules for select to authenticated using(owner_id=(select auth.uid()) and organization_id=coalesce((auth.jwt()->'app_metadata'->>'organization_id')::uuid,(select auth.uid())));
create policy catalog_channel_readiness_owner_select on public.catalog_channel_readiness for select to authenticated using(owner_id=(select auth.uid()) and organization_id=coalesce((auth.jwt()->'app_metadata'->>'organization_id')::uuid,(select auth.uid())));

grant select on public.catalog_field_states,public.catalog_exception_groups,public.catalog_exceptions,public.catalog_preparation_rules,public.catalog_channel_readiness to authenticated;
grant select,insert,update,delete on public.catalog_field_states,public.catalog_exception_groups,public.catalog_exceptions,public.catalog_preparation_rules,public.catalog_channel_readiness to service_role;
revoke all on public.catalog_field_states,public.catalog_exception_groups,public.catalog_exceptions,public.catalog_preparation_rules,public.catalog_channel_readiness from anon;
commit;


