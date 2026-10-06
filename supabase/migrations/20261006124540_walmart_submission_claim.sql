begin;
create or replace function public.reserve_catalog_channel_submission(p_owner uuid,p_organization uuid,p_sku text,p_channel text,p_version timestamptz,p_hash text,p_payload jsonb,p_target jsonb) returns uuid
language plpgsql set search_path='' as $$
declare claim_id uuid; product public.prelistings%rowtype; parent public.prelistings%rowtype;
begin
 if p_hash is null or p_hash !~ '^[a-f0-9]{64}$' or p_channel is null or p_channel not in ('ebay-us','amazon-us','walmart-us') then raise exception 'Invalid channel submission';end if;
 if p_channel='ebay-us' and (jsonb_typeof(p_payload->'inventory') is distinct from 'object' or jsonb_typeof(p_payload->'offer') is distinct from 'object' or p_payload->'offer'->>'sku' is distinct from p_sku or p_target->>'marketplace_id' is distinct from 'EBAY_US' or coalesce(p_target->>'account_id','')='') then raise exception 'Invalid eBay submission';end if;
 if p_channel='amazon-us' and (jsonb_typeof(p_payload->'attributes') is distinct from 'object' or coalesce(p_payload->>'productType','')='' or coalesce(p_target->>'seller_id','')='' or coalesce(p_target->>'marketplace_id','')='' or coalesce(p_target->>'operation','') not in ('listing_put','offer_patch')) then raise exception 'Invalid Amazon submission';end if;
 if p_channel='walmart-us' and (jsonb_typeof(p_payload->'MPItemFeedHeader') is distinct from 'object' or p_payload->'MPItemFeedHeader'->>'feedType' is distinct from 'MP_ITEM' or jsonb_typeof(p_payload->'MPItem') is distinct from 'array' or jsonb_array_length(p_payload->'MPItem')<>1 or p_payload#>>'{MPItem,0,Orderable,sku}' is distinct from p_sku or p_target->>'marketplace_id' is distinct from 'US' or p_target->>'operation' is distinct from 'walmart_mp_item' or coalesce(p_target->>'account_id','')='') then raise exception 'Invalid Walmart submission';end if;
 if p_target->>'operation'='offer_patch' and (p_channel<>'amazon-us' or p_target->>'authority' is distinct from 'prelisting') then raise exception 'Offer authority required';end if;
 if p_channel='walmart-us' then
  if jsonb_typeof(p_target->'feed_limits') is distinct from 'object' or jsonb_typeof(p_target#>'{feed_limits,max_submissions}') is distinct from 'number' or jsonb_typeof(p_target#>'{feed_limits,window_seconds}') is distinct from 'number' or jsonb_typeof(p_target#>'{feed_limits,max_bytes}') is distinct from 'number' then raise exception 'Walmart quota proof required';end if;
  if (p_target#>>'{feed_limits,max_submissions}')::numeric<>trunc((p_target#>>'{feed_limits,max_submissions}')::numeric) or (p_target#>>'{feed_limits,max_submissions}')::numeric<1 or (p_target#>>'{feed_limits,max_submissions}')::numeric>100000 or (p_target#>>'{feed_limits,window_seconds}')::numeric<>trunc((p_target#>>'{feed_limits,window_seconds}')::numeric) or (p_target#>>'{feed_limits,window_seconds}')::numeric<1 or (p_target#>>'{feed_limits,window_seconds}')::numeric>31536000 or (p_target#>>'{feed_limits,max_bytes}')::numeric<1 or (p_target#>>'{feed_limits,max_bytes}')::numeric>10000000 then raise exception 'Invalid Walmart quota';end if;
  if octet_length(convert_to(p_payload::text,'UTF8'))>(p_target#>>'{feed_limits,max_bytes}')::numeric then raise exception 'Walmart payload exceeds account limit';end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('walmart-account:'||(p_target->>'account_id'),0));
  if (select count(*) from public.catalog_submissions where channel='walmart-us' and target->>'account_id'=p_target->>'account_id' and created_at>=now()-pg_catalog.make_interval(secs=>(p_target#>>'{feed_limits,window_seconds}')::double precision))>=(p_target#>>'{feed_limits,max_submissions}')::numeric then raise exception 'Walmart account feed quota reserved';end if;
 end if;
 -- Lock all explicit dependencies in deterministic order before validating their versions.
 perform 1 from public.prelistings where owner_id=p_owner and organization_id=p_organization and sku in (p_sku,p_target#>>'{family,sku}') order by sku for update;
 select * into product from public.prelistings where owner_id=p_owner and organization_id=p_organization and sku=p_sku and updated_at=p_version and status<>'archived';
 if not found then raise exception 'Product version changed';end if;
 if p_channel='walmart-us' and product.payload#>>'{_catalog,channels,walmart-us,approval,hash}' is distinct from p_hash then raise exception 'Walmart approval changed';end if;
 if p_channel='walmart-us' and product.payload->>'relationship' in ('Parent','Child') then raise exception 'Walmart family contract required';end if;
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
create index catalog_submissions_walmart_quota on public.catalog_submissions((target->>'account_id'),created_at) where channel='walmart-us';
commit;
