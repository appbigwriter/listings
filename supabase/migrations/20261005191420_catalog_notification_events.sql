begin;
create table public.catalog_events (
 id uuid primary key,organization_id uuid not null,owner_id uuid not null,prelisting_id uuid not null,sku text not null,
 provider text not null check(provider='amazon'),notification_id text not null,notification_type text not null check(notification_type in ('LISTINGS_ITEM_STATUS_CHANGE','LISTINGS_ITEM_ISSUES_CHANGE')),
 event_time timestamptz not null,payload_hash text not null check(payload_hash ~ '^[a-f0-9]{64}$'),payload jsonb not null,
 status text not null default 'pending' check(status in ('pending','processing','completed','failed','ignored')),
 lease_token uuid,lease_until timestamptz,attempts integer not null default 0 check(attempts>=0),error_code text,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(organization_id,provider,notification_id),
 foreign key(prelisting_id,organization_id,owner_id) references public.prelistings(id,organization_id,owner_id)
);
alter table public.catalog_events enable row level security;
create policy catalog_events_owner_read on public.catalog_events for select to authenticated
using(owner_id=(select auth.uid()) and organization_id=coalesce((auth.jwt()->'app_metadata'->>'organization_id')::uuid,(select auth.uid())));
revoke all on public.catalog_events from public,anon,authenticated,service_role;
grant select on public.catalog_events to authenticated;
grant select,insert,update on public.catalog_events to service_role;
create index catalog_events_owner_status on public.catalog_events(organization_id,owner_id,status,created_at desc);
create index catalog_events_product on public.catalog_events(prelisting_id,organization_id,owner_id);
commit;
