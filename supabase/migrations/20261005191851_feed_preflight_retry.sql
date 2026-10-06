begin;
alter table public.catalog_feeds add column attempt_no integer not null default 1 check(attempt_no>=1);
alter table public.catalog_feeds add column retry_of uuid references public.catalog_feeds(id);
alter table public.catalog_submissions add column attempt_no integer not null default 1 check(attempt_no>=1);
-- Locate only the two exact existing unique constraints; abort on drift rather than dropping guessed names.
do $$ declare constraint_name text; begin
 select conname into strict constraint_name from pg_catalog.pg_constraint where conrelid='public.catalog_feeds'::regclass and contype='u' and pg_catalog.pg_get_constraintdef(oid)='UNIQUE (organization_id, owner_id, manifest_hash)';
 execute pg_catalog.format('alter table public.catalog_feeds drop constraint %I',constraint_name);
 select conname into strict constraint_name from pg_catalog.pg_constraint where conrelid='public.catalog_submissions'::regclass and contype='u' and pg_catalog.pg_get_constraintdef(oid)='UNIQUE (organization_id, owner_id, sku, channel, request_hash)';
 execute pg_catalog.format('alter table public.catalog_submissions drop constraint %I',constraint_name);
end $$;
alter table public.catalog_feeds add unique(organization_id,owner_id,manifest_hash,attempt_no);
alter table public.catalog_submissions add unique(organization_id,owner_id,sku,channel,request_hash,attempt_no);
create unique index catalog_submissions_individual_version on public.catalog_submissions(organization_id,owner_id,sku,channel,request_hash) where feed_batch_id is null;
create index catalog_feeds_retry_parent on public.catalog_feeds(retry_of);
drop function public.reserve_catalog_feed(uuid,uuid,text,jsonb,jsonb,jsonb);
create function public.reserve_catalog_feed(p_owner uuid,p_organization uuid,p_manifest_hash text,p_manifest jsonb,p_payload jsonb,p_target jsonb,p_retry_of uuid default null) returns uuid
language plpgsql set search_path='' as $$
declare batch_id uuid;item jsonb;message jsonb;prior public.catalog_feeds%rowtype;new_attempt integer:=1;
begin
 if jsonb_typeof(p_manifest)<>'array' or jsonb_array_length(p_manifest)<1 or jsonb_array_length(p_manifest)>5000 then raise exception 'Invalid manifest';end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_organization::text||p_owner::text||':feeds',0));
 if exists(select 1 from public.catalog_feeds where organization_id=p_organization and owner_id=p_owner and status in ('preparing','uploading','submitting','unknown')) then raise exception 'An uncertain feed must be reconciled';end if;
 if p_retry_of is not null then
  select * into prior from public.catalog_feeds where id=p_retry_of and owner_id=p_owner and organization_id=p_organization for update;
  if not found or prior.status<>'failed' or prior.feed_id is not null or prior.manifest_hash<>p_manifest_hash or prior.payload<>p_payload or prior.manifest<>p_manifest or prior.target<>p_target then raise exception 'Only an identical proven preflight failure can be retried';end if;
  if exists(select 1 from public.catalog_feeds where organization_id=p_organization and owner_id=p_owner and manifest_hash=p_manifest_hash and attempt_no>prior.attempt_no) then raise exception 'A newer attempt already exists';end if;
  if (select count(*) from public.catalog_submissions where feed_batch_id=prior.id)<>jsonb_array_length(p_manifest) or exists(select 1 from public.catalog_submissions where feed_batch_id=prior.id and (status<>'rejected' or response->'external_started' is distinct from 'false'::jsonb)) then raise exception 'All SKU claims must prove no createFeed started';end if;
  new_attempt:=prior.attempt_no+1;
 elsif exists(select 1 from public.catalog_feeds where organization_id=p_organization and owner_id=p_owner and manifest_hash=p_manifest_hash) then raise exception 'Explicit retry reference required';
 end if;
 insert into public.catalog_feeds(owner_id,organization_id,manifest_hash,manifest,payload,target,attempt_no,retry_of)
 values(p_owner,p_organization,p_manifest_hash,p_manifest,p_payload,p_target,new_attempt,p_retry_of) returning id into batch_id;
 for item in select value from jsonb_array_elements(p_manifest) loop
  perform 1 from public.prelistings where owner_id=p_owner and organization_id=p_organization and sku=item->>'sku' and updated_at=(item->>'updated_at')::timestamptz and status<>'archived' for update;
  if not found then raise exception 'The product version changed';end if;
  if exists(select 1 from public.catalog_submissions where organization_id=p_organization and owner_id=p_owner and sku=item->>'sku' and channel='amazon-us' and request_hash=item->>'hash' and (p_retry_of is null or status<>'rejected' or response->'external_started' is distinct from 'false'::jsonb or feed_batch_id is null)) then raise exception 'SKU version has an existing submission that cannot be retried';end if;
  select value into message from jsonb_array_elements(p_payload->'messages') where value->>'sku'=item->>'sku';
  if message is null then raise exception 'Missing message';end if;
  insert into public.catalog_submissions(owner_id,organization_id,sku,channel,request_hash,status,request_payload,target,feed_batch_id,attempt_no)
  values(p_owner,p_organization,item->>'sku','amazon-us',item->>'hash','submitting',jsonb_build_object('attributes',message->'attributes','productType',message->'productType','requirements',message->'requirements'),p_target,batch_id,new_attempt);
 end loop;
 return batch_id;
end $$;
revoke all on function public.reserve_catalog_feed(uuid,uuid,text,jsonb,jsonb,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.reserve_catalog_feed(uuid,uuid,text,jsonb,jsonb,jsonb,uuid) to service_role;
commit;
