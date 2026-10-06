begin;
create function public.record_catalog_feed_outcome(p_owner uuid,p_organization uuid,p_batch uuid,p_lease uuid,p_sku text,p_hash text,p_status text,p_response jsonb,p_expected_version timestamptz,p_submission jsonb) returns jsonb
language plpgsql set search_path='' as $$
declare batch public.catalog_feeds%rowtype;claim_id uuid;projected integer:=0;
begin
 if p_status not in ('accepted','rejected','unknown') then raise exception 'Invalid feed outcome';end if;
 select * into batch from public.catalog_feeds where id=p_batch and owner_id=p_owner and organization_id=p_organization for update;
 if not found or p_lease is null or batch.lease_token is distinct from p_lease or batch.lease_until<=now() or batch.lease_until is null then raise exception 'Feed monitor lease lost';end if;
 select id into claim_id from public.catalog_submissions where feed_batch_id=p_batch and owner_id=p_owner and organization_id=p_organization and sku=p_sku and request_hash=p_hash and status in ('submitting','unknown') for update;
 if not found then return jsonb_build_object('claim_updated',false,'product_updated',false);end if;
 update public.catalog_submissions set status=p_status,response=p_response,updated_at=clock_timestamp() where id=claim_id;
 if p_submission is not null and p_expected_version is not null then
  if p_submission->>'status' is distinct from p_status or p_submission->>'request_hash' is distinct from p_hash or p_submission->'response'->>'feed_id' is distinct from batch.feed_id then raise exception 'Submission projection does not match the feed outcome';end if;
  update public.prelistings set payload=jsonb_set(payload,'{_catalog,channels,amazon-us,submission}',p_submission,true),updated_at=greatest(clock_timestamp(),updated_at+interval '1 millisecond')
  where organization_id=p_organization and owner_id=p_owner and sku=p_sku and updated_at=p_expected_version and status<>'archived' and jsonb_typeof(payload#>'{_catalog,channels,amazon-us}')='object';
  get diagnostics projected=row_count;
 end if;
 return jsonb_build_object('claim_updated',true,'product_updated',projected=1);
end $$;
revoke all on function public.record_catalog_feed_outcome(uuid,uuid,uuid,uuid,text,text,text,jsonb,timestamptz,jsonb) from public,anon,authenticated;
grant execute on function public.record_catalog_feed_outcome(uuid,uuid,uuid,uuid,text,text,text,jsonb,timestamptz,jsonb) to service_role;
commit;
