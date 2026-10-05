begin;
create table public.catalog_versions (
  id uuid primary key default gen_random_uuid(),
  prelisting_id uuid not null references public.prelistings(id),
  owner_id uuid not null, organization_id uuid not null, sku text not null,
  snapshot jsonb not null, fingerprint text not null,
  created_at timestamptz not null default clock_timestamp()
);
create index catalog_versions_item_history on public.catalog_versions(organization_id,owner_id,sku,created_at desc);
alter table public.catalog_versions enable row level security;
create policy catalog_versions_owner_read on public.catalog_versions for select to authenticated
using(owner_id=(select auth.uid()) and organization_id=coalesce((auth.jwt()->'app_metadata'->>'organization_id')::uuid,(select auth.uid())));
revoke all on public.catalog_versions from public,anon,authenticated,service_role;
grant select on public.catalog_versions to authenticated;
grant select,insert on public.catalog_versions to service_role;
create function public.prelisting_capture_version() returns trigger language plpgsql set search_path = '' as $$
begin
  if new.owner_id is null or new.organization_id is null then return new; end if;
  if tg_op='UPDATE' and (to_jsonb(new)-'updated_at')=(to_jsonb(old)-'updated_at') then return new; end if;
  insert into public.catalog_versions(prelisting_id,owner_id,organization_id,sku,snapshot,fingerprint)
  values(new.id,new.owner_id,new.organization_id,new.sku,to_jsonb(new),md5((to_jsonb(new)-'updated_at')::text));
  return new;
end $$;
revoke all on function public.prelisting_capture_version() from public,anon,authenticated;
create trigger prelisting_version_snapshot after insert or update on public.prelistings
for each row execute function public.prelisting_capture_version();
insert into public.catalog_versions(prelisting_id,owner_id,organization_id,sku,snapshot,fingerprint)
select id,owner_id,organization_id,sku,to_jsonb(p),md5((to_jsonb(p)-'updated_at')::text) from public.prelistings p
where owner_id is not null and organization_id is not null;
commit;
