begin;

alter table public.marketplace_accounts
  drop constraint if exists marketplace_accounts_account_id_check,
  drop constraint if exists marketplace_accounts_marketplace_id_check,
  drop constraint if exists marketplace_accounts_credential_ref_check,
  add constraint marketplace_accounts_account_id_format check(length(account_id) between 1 and 200 and account_id !~ '[^A-Za-z0-9._:-]'),
  add constraint marketplace_accounts_marketplace_id_format check(length(marketplace_id) between 1 and 100 and marketplace_id !~ '[^A-Za-z0-9_-]'),
  add constraint marketplace_accounts_credential_ref_format check(length(credential_ref) between 1 and 512 and credential_ref !~ '[^A-Za-z0-9._:/-]'),
  add column if not exists credential_state text not null default 'unknown' check(credential_state in ('unknown','healthy','refresh_required','invalid','insufficient_scope','rate_limited','revoked')),
  add column if not exists writes_blocked_until timestamptz,
  add column if not exists last_checked_at timestamptz;

create table public.marketplace_credential_incidents(
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null, organization_id uuid not null,
 marketplace_account_id uuid not null references public.marketplace_accounts(id) on delete cascade,
 code text not null check(code in ('token_invalid','refresh_failed','insufficient_scope','rate_limited','revoked','provider_unavailable')),
 status text not null default 'open' check(status in ('open','acknowledged','resolved','dismissed')),
 message text not null, evidence jsonb not null default '{}'::jsonb,
 writes_blocked boolean not null default true,
 first_seen_at timestamptz not null default now(), last_seen_at timestamptz not null default now(),
 resolved_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(organization_id,owner_id,marketplace_account_id,code,status)
);
create index marketplace_credential_incidents_queue_idx on public.marketplace_credential_incidents(organization_id,owner_id,status,last_seen_at desc);
alter table public.marketplace_credential_incidents enable row level security;
create policy marketplace_credential_incidents_owner_select on public.marketplace_credential_incidents for select to authenticated using(owner_id=(select auth.uid()) and organization_id=coalesce((auth.jwt()->'app_metadata'->>'organization_id')::uuid,(select auth.uid())));
grant select on public.marketplace_credential_incidents to authenticated;
grant select,insert,update,delete on public.marketplace_credential_incidents to service_role;
revoke all on public.marketplace_credential_incidents from anon;
commit;


