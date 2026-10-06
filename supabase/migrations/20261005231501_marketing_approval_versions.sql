begin;
alter table public.marketing_approvals add column content_hash text check(content_hash ~ '^[a-f0-9]{64}$'), add column signature text check(signature ~ '^[a-f0-9]{64}$'), add column snapshot jsonb;
create function public.record_marketing_approval(p_owner uuid,p_organization uuid,p_sku text,p_profile uuid,p_record jsonb,p_snapshot jsonb,p_versions jsonb)
returns uuid language plpgsql set search_path='' as $$
declare approval_id uuid; table_name text; version_key text; actual_version timestamptz; expected_version timestamptz;
begin
 if p_record is null or p_snapshot is null or p_versions is null or jsonb_typeof(p_snapshot)<>'object'
 or coalesce(p_record->>'decision','') not in ('approved','rejected','changes_requested')
 or coalesce(p_record->>'owner_id','')<>p_owner::text or coalesce(p_record->>'organization_id','')<>p_organization::text
 or coalesce(p_record->>'sku','')<>p_sku or coalesce(p_record->>'approver','')<>p_owner::text
 or coalesce(p_record->>'content_hash','')!~'^[a-f0-9]{64}$' or coalesce(p_record->>'signature','')!~'^[a-f0-9]{64}$'
 then raise exception 'Invalid marketing approval'; end if;
 perform 1 from public.prelistings where sku=p_sku and owner_id=p_owner and organization_id=p_organization and status<>'archived' and updated_at=(p_versions->>'listing')::timestamptz for update;
 if not found then raise exception 'Listing version changed'; end if;
 perform 1 from public.product_marketing_profiles where id=p_profile and sku=p_sku and owner_id=p_owner and organization_id=p_organization and updated_at=(p_versions->>'profile')::timestamptz for update;
 if not found then raise exception 'Marketing profile version changed'; end if;
 -- Serialize plan writes, including insertion when the reviewed snapshot had no plan.
 lock table public.amazon_campaign_plans,public.meta_campaign_plans,public.tracking_plans in share row exclusive mode;
 for table_name,version_key in select * from (values ('amazon_campaign_plans','amazon'),('meta_campaign_plans','meta'),('tracking_plans','tracking')) v(t,k) loop
   actual_version:=null;
   execute format('select updated_at from public.%I where marketing_profile_id=$1 and sku=$2 and owner_id=$3 and organization_id=$4 for update',table_name) into actual_version using p_profile,p_sku,p_owner,p_organization;
   expected_version:=(p_versions->>version_key)::timestamptz;
   if actual_version is distinct from expected_version then raise exception 'Marketing plan version changed'; end if;
 end loop;
 insert into public.marketing_approvals(marketing_profile_id,sku,owner_id,organization_id,decision,approver,comments,created_at,content_hash,signature,snapshot)
 values(p_profile,p_sku,p_owner,p_organization,p_record->>'decision',p_record->>'approver',p_record->>'comments',(p_record->>'created_at')::timestamptz,p_record->>'content_hash',p_record->>'signature',p_snapshot) returning id into approval_id;
 update public.product_marketing_profiles set status=case when p_record->>'decision'='approved' then 'launch_ready' else 'approval_pending' end,approval_notes=p_record->>'comments',updated_at=clock_timestamp() where id=p_profile;
 return approval_id;
end $$;
revoke all on function public.record_marketing_approval(uuid,uuid,text,uuid,jsonb,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.record_marketing_approval(uuid,uuid,text,uuid,jsonb,jsonb,jsonb) to service_role;
commit;
