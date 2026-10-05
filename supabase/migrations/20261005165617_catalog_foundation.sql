-- Catalog-only upgrade. Existing unowned records remain stored until an
-- administrator supplies a verified ownership mapping. No row is backfilled here.
begin;
do $$ begin
  if to_regclass('public.prelistings') is null then
    raise exception 'Catalog foundation requires the existing prelistings table';
  end if;
end $$;
alter table public.prelistings add column if not exists owner_id uuid;
alter table public.prelistings add column if not exists organization_id uuid;
alter table public.prelistings add column if not exists archived_at timestamptz;
alter table public.prelistings add column if not exists template_key text;
alter table public.prelistings add column if not exists template_version text;
alter table public.prelistings add column if not exists human_reviewed boolean not null default false;
alter table public.prelistings add column if not exists submission jsonb not null default '{"status":"not_submitted","publication_status":"not_published"}'::jsonb;
-- NOT VALID preserves legacy records; new inserts and updates require identities.
alter table public.prelistings add constraint catalog_new_rows_have_owner
  check (owner_id is not null and organization_id is not null) not valid;
create unique index if not exists prelistings_catalog_org_sku_idx on public.prelistings(organization_id, sku);
create index if not exists prelistings_catalog_owner_idx on public.prelistings(organization_id, owner_id, updated_at desc);
alter table public.prelistings enable row level security;
do $$ declare p record; begin
  for p in select policyname from pg_policies where schemaname='public' and tablename='prelistings' loop
    execute format('drop policy %I on public.prelistings', p.policyname);
  end loop;
end $$;
create policy catalog_prelistings_owner_read on public.prelistings for select to authenticated
  using (owner_id = (select auth.uid()) and organization_id = coalesce((auth.jwt()->'app_metadata'->>'organization_id')::uuid, (select auth.uid())));
-- Mutations go through authenticated, tenant-scoped server routes.
revoke all on public.prelistings from anon, authenticated;
grant select on public.prelistings to authenticated;
grant select, insert, update, delete on public.prelistings to service_role;
commit;
