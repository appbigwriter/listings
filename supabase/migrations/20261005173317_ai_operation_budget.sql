begin;
create table public.catalog_ai_operations (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null,organization_id uuid not null,
  sku text not null, action text not null check(action in ('generate','classify')),
  day date not null default (now() at time zone 'UTC')::date,
  status text not null default 'reserved' check(status in ('reserved','completed','failed')),
  usage jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create index catalog_ai_daily_usage on public.catalog_ai_operations(organization_id,day);
alter table public.catalog_ai_operations enable row level security;
create policy catalog_ai_owner_read on public.catalog_ai_operations for select to authenticated
using(owner_id=(select auth.uid()) and organization_id=coalesce((auth.jwt()->'app_metadata'->>'organization_id')::uuid,(select auth.uid())));
revoke all on public.catalog_ai_operations from public,anon,authenticated;
grant select on public.catalog_ai_operations to authenticated;
grant select,insert,update on public.catalog_ai_operations to service_role;
create function public.reserve_catalog_ai_operation(p_owner uuid,p_organization uuid,p_sku text,p_action text,p_limit integer) returns uuid
language plpgsql set search_path='' as $$
declare operation_id uuid; today date := (now() at time zone 'UTC')::date;
begin
  if p_limit<1 or p_limit>10000 then raise exception 'Invalid operation limit'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_organization::text,0));
  if (select count(*) from public.catalog_ai_operations where organization_id=p_organization and day=today)>=p_limit then return null; end if;
  insert into public.catalog_ai_operations(owner_id,organization_id,sku,action,day) values(p_owner,p_organization,p_sku,p_action,today) returning id into operation_id;
  return operation_id;
end $$;
revoke all on function public.reserve_catalog_ai_operation(uuid,uuid,text,text,integer) from public,anon,authenticated;
grant execute on function public.reserve_catalog_ai_operation(uuid,uuid,text,text,integer) to service_role;
commit;
