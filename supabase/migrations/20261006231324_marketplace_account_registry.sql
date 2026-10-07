begin;
create table public.marketplace_accounts(
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null,organization_id uuid not null,
 channel text not null check(channel in ('amazon-us','ebay-us','walmart-us','tiktok-us')),
 account_id text not null check(account_id~'^[A-Za-z0-9._:-]{1,200}$'),
 marketplace_id text not null check(marketplace_id~'^[A-Za-z0-9_-]{1,100}$'),
 credential_ref text not null check(credential_ref~'^[A-Za-z0-9._:/-]{1,512}$'),
 status text not null check(status in ('configured','active','degraded','revoked')),
 configuration jsonb not null default '{}'::jsonb check(jsonb_typeof(configuration)='object'),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(organization_id,owner_id,channel,account_id,marketplace_id)
);
alter table public.marketplace_accounts enable row level security;
create policy marketplace_accounts_owner_select on public.marketplace_accounts for select to authenticated using(owner_id=(select auth.uid()) and organization_id=coalesce((auth.jwt()->'app_metadata'->>'organization_id')::uuid,(select auth.uid())));
grant select on public.marketplace_accounts to authenticated;
grant select,insert,update,delete on public.marketplace_accounts to service_role;
revoke all on public.marketplace_accounts from anon;
commit;

