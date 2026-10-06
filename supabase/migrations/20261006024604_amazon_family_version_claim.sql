begin;
create or replace function public.reserve_catalog_channel_submission(p_owner uuid,p_organization uuid,p_sku text,p_channel text,p_version timestamptz,p_hash text,p_payload jsonb,p_target jsonb) returns uuid
language plpgsql set search_path='' as $$
declare claim_id uuid; product public.prelistings%rowtype; parent public.prelistings%rowtype;
begin
 if p_hash is null or p_hash !~ '^[a-f0-9]{64}$' or p_channel is null or p_channel not in ('ebay-us','amazon-us') then raise exception 'Invalid channel submission';end if;
 if p_channel='ebay-us' and (jsonb_typeof(p_payload->'inventory') is distinct from 'object' or jsonb_typeof(p_payload->'offer') is distinct from 'object' or p_payload->'offer'->>'sku' is distinct from p_sku or p_target->>'marketplace_id' is distinct from 'EBAY_US' or coalesce(p_target->>'account_id','')='') then raise exception 'Invalid eBay submission';end if;
 if p_channel='amazon-us' and (jsonb_typeof(p_payload->'attributes') is distinct from 'object' or coalesce(p_payload->>'productType','')='' or coalesce(p_target->>'seller_id','')='' or coalesce(p_target->>'marketplace_id','')='' or coalesce(p_target->>'operation','') not in ('listing_put','offer_patch')) then raise exception 'Invalid Amazon submission';end if;
 if p_target->>'operation'='offer_patch' and (p_channel<>'amazon-us' or p_target->>'authority' is distinct from 'prelisting') then raise exception 'Offer authority required';end if;
 -- Lock all explicit dependencies in deterministic order before validating their versions.
 perform 1 from public.prelistings where owner_id=p_owner and organization_id=p_organization and sku in (p_sku,p_target#>>'{family,sku}') order by sku for update;
 select * into product from public.prelistings where owner_id=p_owner and organization_id=p_organization and sku=p_sku and updated_at=p_version and status<>'archived';
 if not found then raise exception 'Product version changed';end if;
 if p_channel='amazon-us' and p_target->>'operation'='listing_put' and product.payload->>'relationship'='Child' then
  if jsonb_typeof(p_target->'family') is distinct from 'object' or p_target#>>'{family,sku}' is distinct from product.payload->>'parent_sku' or p_target#>>'{family,sku}'=p_sku or coalesce(p_target#>>'{family,content_hash}','') !~ '^[a-f0-9]{64}$' or p_target#>>'{family,updated_at}' is null then raise exception 'Parent version proof required';end if;
  select * into parent from public.prelistings where owner_id=p_owner and organization_id=p_organization and sku=p_target#>>'{family,sku}' and updated_at=(p_target#>>'{family,updated_at}')::timestamptz and status<>'archived';
  if not found or parent.payload->>'relationship' is distinct from 'Parent' or parent.payload#>>'{_catalog,channels,amazon-us,approval,hash}' is distinct from p_target#>>'{family,content_hash}' then raise exception 'Parent version or approval changed';end if;
 end if;
 if exists(select 1 from public.catalog_submissions where owner_id=p_owner and organization_id=p_organization and sku=p_sku and channel=p_channel and status in ('submitting','unknown')) then raise exception 'An uncertain submission must be investigated';end if;
 insert into public.catalog_submissions(owner_id,organization_id,sku,channel,request_hash,status,request_payload,target,response)
 values(p_owner,p_organization,p_sku,p_channel,p_hash,'submitting',p_payload,p_target,'{"stage":"reserved"}') returning id into claim_id;
 return claim_id;
end $$;
revoke all on function public.reserve_catalog_channel_submission(uuid,uuid,text,text,timestamptz,text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.reserve_catalog_channel_submission(uuid,uuid,text,text,timestamptz,text,jsonb,jsonb) to service_role;
create or replace function public.reserve_catalog_feed(p_owner uuid,p_organization uuid,p_manifest_hash text,p_manifest jsonb,p_payload jsonb,p_target jsonb,p_retry_of uuid default null) returns uuid
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
 -- Acquire row locks in the same order as individual parent/child claims.
 perform 1 from public.prelistings where owner_id=p_owner and organization_id=p_organization and sku in (select value->>'sku' from jsonb_array_elements(p_manifest)) order by sku for update;
 for item in select value from jsonb_array_elements(p_manifest) loop
  perform 1 from public.prelistings where owner_id=p_owner and organization_id=p_organization and sku=item->>'sku' and updated_at=(item->>'updated_at')::timestamptz and status<>'archived' for update;
  if not found then raise exception 'The product version changed';end if;
  if exists(select 1 from public.prelistings child where child.owner_id=p_owner and child.organization_id=p_organization and child.sku=item->>'sku' and child.payload->>'relationship'='Child' and not exists(select 1 from public.prelistings parent where parent.owner_id=p_owner and parent.organization_id=p_organization and parent.sku=child.payload->>'parent_sku' and parent.payload->>'relationship'='Parent' and parent.status<>'archived' and exists(select 1 from jsonb_array_elements(p_manifest) member where member->>'sku'=parent.sku))) then raise exception 'Include the active parent in the family feed';end if;
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
