begin;
alter table public.catalog_ai_operations add column reserved_usd_micro bigint not null default 0 check(reserved_usd_micro>=0);
alter table public.catalog_ai_operations add column estimated_usd_micro bigint check(estimated_usd_micro>=0);
alter table public.catalog_ai_operations add column pricing jsonb;
create function public.reserve_catalog_ai_operation_cost(p_owner uuid,p_organization uuid,p_sku text,p_action text,p_limit integer,p_daily_usd_micro bigint,p_reserved_usd_micro bigint,p_pricing jsonb) returns uuid
language plpgsql set search_path='' as $$
declare operation_id uuid;today date := (now() at time zone 'UTC')::date;
begin
 if p_limit<1 or p_limit>10000 or p_reserved_usd_micro<0 or p_daily_usd_micro is not null and (p_daily_usd_micro<1 or p_reserved_usd_micro<1) then raise exception 'Invalid budget';end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_organization::text,0));
 if (select count(*) from public.catalog_ai_operations where organization_id=p_organization and day=today)>=p_limit then return null;end if;
 if p_daily_usd_micro is not null and (select coalesce(sum(reserved_usd_micro),0) from public.catalog_ai_operations where organization_id=p_organization and day=today)+p_reserved_usd_micro>p_daily_usd_micro then return null;end if;
 insert into public.catalog_ai_operations(owner_id,organization_id,sku,action,day,reserved_usd_micro,pricing) values(p_owner,p_organization,p_sku,p_action,today,p_reserved_usd_micro,p_pricing) returning id into operation_id;
 return operation_id;
end $$;
revoke all on function public.reserve_catalog_ai_operation_cost(uuid,uuid,text,text,integer,bigint,bigint,jsonb) from public,anon,authenticated;
grant execute on function public.reserve_catalog_ai_operation_cost(uuid,uuid,text,text,integer,bigint,bigint,jsonb) to service_role;
commit;
