begin;
create table public.catalog_assets (
 id uuid primary key,owner_id uuid not null,organization_id uuid not null,prelisting_id uuid not null,
 sku text not null,purpose text not null check(purpose in ('technical','compliance','image')),
 filename text not null,mime_type text not null check(mime_type in ('application/pdf','image/jpeg','image/png')),
 byte_size integer not null check(byte_size between 1 and 5000000),sha256 text not null check(sha256 ~ '^[a-f0-9]{64}$'),
 object_path text not null unique,status text not null default 'pending' check(status in ('pending','ready','failed')),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 foreign key(prelisting_id,organization_id,owner_id) references public.prelistings(id,organization_id,owner_id)
);
alter table public.catalog_assets enable row level security;
create policy catalog_assets_owner_read on public.catalog_assets for select to authenticated
using(owner_id=(select auth.uid()) and organization_id=coalesce((auth.jwt()->'app_metadata'->>'organization_id')::uuid,(select auth.uid())));
revoke all on public.catalog_assets from public,anon,authenticated,service_role;
grant select on public.catalog_assets to authenticated;
grant select,insert,update on public.catalog_assets to service_role;
create index catalog_assets_product_versions on public.catalog_assets(organization_id,owner_id,prelisting_id,created_at desc);
-- This bucket is intentionally server-only. No client storage policy permits direct reads or writes.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('prelisting-evidence','prelisting-evidence',false,5000000,array['application/pdf','image/jpeg','image/png']);
commit;
