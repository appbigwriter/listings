begin;
create unique index amazon_campaign_plans_org_profile on public.amazon_campaign_plans(organization_id,marketing_profile_id);
create unique index meta_campaign_plans_org_profile on public.meta_campaign_plans(organization_id,marketing_profile_id);
create unique index tracking_plans_org_profile on public.tracking_plans(organization_id,marketing_profile_id);
create table public.catalog_feeds (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null,organization_id uuid not null,
 manifest_hash text not null,payload jsonb not null,manifest jsonb not null,target jsonb not null,
 status text not null default 'preparing' check(status in ('preparing','uploading','submitting','processing','completed','cancelled','failed','unknown')),
 document_id text,feed_id text,result_document_id text,processing_status text,report jsonb,
 lease_token uuid,lease_until timestamptz,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(organization_id,owner_id,manifest_hash)
);
alter table public.catalog_feeds enable row level security;
create policy catalog_feeds_owner_read on public.catalog_feeds for select to authenticated
using(owner_id=(select auth.uid()) and organization_id=coalesce((auth.jwt()->'app_metadata'->>'organization_id')::uuid,(select auth.uid())));
revoke all on public.catalog_feeds from public,anon,authenticated,service_role;
grant select on public.catalog_feeds to authenticated;
grant select,insert,update on public.catalog_feeds to service_role;
create index catalog_feeds_monitor on public.catalog_feeds(status,updated_at);
alter table public.catalog_submissions add column feed_batch_id uuid references public.catalog_feeds(id);
create function public.reserve_catalog_feed(p_owner uuid,p_organization uuid,p_manifest_hash text,p_manifest jsonb,p_payload jsonb,p_target jsonb) returns uuid
language plpgsql set search_path='' as $$
declare batch_id uuid; item jsonb; message jsonb;
begin
  if jsonb_typeof(p_manifest)<>'array' or jsonb_array_length(p_manifest)<1 or jsonb_array_length(p_manifest)>5000 then raise exception 'Invalid manifest'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_organization::text||p_owner::text||':feeds',0));
  if exists(select 1 from public.catalog_feeds where organization_id=p_organization and owner_id=p_owner and status in ('preparing','uploading','submitting','unknown')) then raise exception 'An uncertain feed must be reconciled'; end if;
  insert into public.catalog_feeds(owner_id,organization_id,manifest_hash,manifest,payload,target)
  values(p_owner,p_organization,p_manifest_hash,p_manifest,p_payload,p_target) returning id into batch_id;
  for item in select value from jsonb_array_elements(p_manifest) loop
    perform 1 from public.prelistings where owner_id=p_owner and organization_id=p_organization and sku=item->>'sku' and updated_at=(item->>'updated_at')::timestamptz and status<>'archived' for update;
    if not found then raise exception 'The product version changed'; end if;
    select value into message from jsonb_array_elements(p_payload->'messages') where value->>'sku'=item->>'sku';
    if message is null then raise exception 'Missing message'; end if;
    insert into public.catalog_submissions(owner_id,organization_id,sku,channel,request_hash,status,request_payload,target,feed_batch_id)
    values(p_owner,p_organization,item->>'sku','amazon-us',item->>'hash','submitting',jsonb_build_object('attributes',message->'attributes','productType',message->'productType','requirements',message->'requirements'),p_target,batch_id);
  end loop;
  return batch_id;
end $$;
revoke all on function public.reserve_catalog_feed(uuid,uuid,text,jsonb,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.reserve_catalog_feed(uuid,uuid,text,jsonb,jsonb,jsonb) to service_role;
commit;
