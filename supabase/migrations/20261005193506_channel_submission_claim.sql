begin;
create function public.reserve_catalog_channel_submission(p_owner uuid,p_organization uuid,p_sku text,p_channel text,p_version timestamptz,p_hash text,p_payload jsonb,p_target jsonb) returns uuid
language plpgsql set search_path='' as $$
declare claim_id uuid;
begin
 if p_channel<>'ebay-us' or p_hash !~ '^[a-f0-9]{64}$' or jsonb_typeof(p_payload->'inventory') is distinct from 'object' or jsonb_typeof(p_payload->'offer') is distinct from 'object' or p_payload->'offer'->>'sku' is distinct from p_sku or p_target->>'marketplace_id' is distinct from 'EBAY_US' or coalesce(p_target->>'account_id','')='' then raise exception 'Invalid channel submission';end if;
 perform 1 from public.prelistings where owner_id=p_owner and organization_id=p_organization and sku=p_sku and updated_at=p_version and status<>'archived' for update;
 if not found then raise exception 'Product version changed';end if;
 if exists(select 1 from public.catalog_submissions where owner_id=p_owner and organization_id=p_organization and sku=p_sku and channel=p_channel and status in ('submitting','unknown')) then raise exception 'An uncertain submission must be investigated';end if;
 insert into public.catalog_submissions(owner_id,organization_id,sku,channel,request_hash,status,request_payload,target,response)
 values(p_owner,p_organization,p_sku,p_channel,p_hash,'submitting',p_payload,p_target,'{"stage":"reserved"}') returning id into claim_id;
 return claim_id;
end $$;
revoke all on function public.reserve_catalog_channel_submission(uuid,uuid,text,text,timestamptz,text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.reserve_catalog_channel_submission(uuid,uuid,text,text,timestamptz,text,jsonb,jsonb) to service_role;
commit;
