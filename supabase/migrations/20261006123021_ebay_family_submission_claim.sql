begin;
create function public.reserve_ebay_family_submission(p_owner uuid,p_organization uuid,p_parent_sku text,p_manifest jsonb,p_payload jsonb,p_target jsonb) returns uuid
language plpgsql set search_path='' as $$
declare group_id uuid:=gen_random_uuid();item jsonb;member jsonb;product public.prelistings%rowtype;parent public.prelistings%rowtype;
begin
 if p_owner is null or p_organization is null or jsonb_typeof(p_manifest) is distinct from 'array' or jsonb_array_length(p_manifest)<3 or jsonb_array_length(p_manifest)>251 or jsonb_typeof(p_payload->'group') is distinct from 'object' or jsonb_typeof(p_payload->'members') is distinct from 'array' or jsonb_array_length(p_payload->'members')<>jsonb_array_length(p_manifest)-1 or p_target->>'marketplace_id' is distinct from 'EBAY_US' or coalesce(p_target->>'account_id','')='' or coalesce(p_target->>'manifest_hash','')!~'^[a-f0-9]{64}$' then raise exception 'Invalid family submission';end if;
 -- Briefly protect exact membership as well as row versions against concurrent insert/update.
 lock table public.prelistings in share row exclusive mode;
 select * into parent from public.prelistings where owner_id=p_owner and organization_id=p_organization and sku=p_parent_sku and status<>'archived';
 if not found or parent.payload->>'relationship' is distinct from 'Parent' then raise exception 'Active parent required';end if;
 if (select count(*) from public.prelistings where owner_id=p_owner and organization_id=p_organization and status<>'archived' and payload->>'parent_sku'=p_parent_sku)<>jsonb_array_length(p_manifest)-1 then raise exception 'Family membership changed';end if;
 if (select count(distinct value->>'sku') from jsonb_array_elements(p_manifest))<>jsonb_array_length(p_manifest) or (select count(*) from jsonb_array_elements(p_manifest) where value->>'sku'=p_parent_sku)<>1 then raise exception 'Invalid family manifest';end if;
 if jsonb_typeof(p_payload->'group'->'variantSKUs') is distinct from 'array' or jsonb_array_length(p_payload->'group'->'variantSKUs')<>jsonb_array_length(p_manifest)-1 or exists(select 1 from jsonb_array_elements(p_manifest) where value->>'sku'<>p_parent_sku and not (p_payload->'group'->'variantSKUs' ? (value->>'sku'))) then raise exception 'Group membership does not match manifest';end if;
 for item in select value from jsonb_array_elements(p_manifest) loop
  select * into product from public.prelistings where owner_id=p_owner and organization_id=p_organization and sku=item->>'sku' and updated_at=(item->>'updated_at')::timestamptz and status<>'archived';
  if not found or coalesce(item->>'content_hash','')!~'^[a-f0-9]{64}$' or product.payload#>>'{_catalog,channels,ebay-us,approval,hash}' is distinct from item->>'content_hash' then raise exception 'Member version or approval changed';end if;
  if product.sku<>p_parent_sku and (product.payload->>'relationship' is distinct from 'Child' or product.payload->>'parent_sku' is distinct from p_parent_sku) then raise exception 'Wrong family member';end if;
  if exists(select 1 from public.catalog_submissions where owner_id=p_owner and organization_id=p_organization and sku=product.sku and channel='ebay-us' and status in ('submitting','unknown')) then raise exception 'An uncertain member must be reconciled';end if;
  if product.sku=p_parent_sku then member:=jsonb_build_object('group',p_payload->'group','members',p_payload->'members');
  else
   select value into member from jsonb_array_elements(p_payload->'members') where value->>'sku'=product.sku;
   if not found or jsonb_typeof(member->'inventory') is distinct from 'object' or jsonb_typeof(member->'offer') is distinct from 'object' or member->'offer'->>'sku' is distinct from product.sku then raise exception 'Invalid member payload';end if;
   member:=jsonb_build_object('inventory',member->'inventory','offer',member->'offer');
  end if;
  insert into public.catalog_submissions(id,owner_id,organization_id,sku,channel,request_hash,status,request_payload,target,response)
  values(case when product.sku=p_parent_sku then group_id else gen_random_uuid() end,p_owner,p_organization,product.sku,'ebay-us',item->>'content_hash','submitting',member,p_target||jsonb_build_object('family_id',group_id,'group_key',p_parent_sku,'operation',case when product.sku=p_parent_sku then 'family_group' else 'family_member' end),'{"stage":"reserved"}');
 end loop;
 return group_id;
end $$;
create function public.checkpoint_ebay_family_submission(p_owner uuid,p_organization uuid,p_id uuid,p_expected_version timestamptz,p_status text,p_response jsonb) returns timestamptz
language plpgsql set search_path='' as $$
declare claim public.catalog_submissions%rowtype; changed timestamptz:=clock_timestamp();member public.catalog_submissions%rowtype;offer_id text;
begin
 select * into claim from public.catalog_submissions where id=p_id and owner_id=p_owner and organization_id=p_organization and channel='ebay-us' and target->>'operation'='family_group' and status in ('submitting','unknown','accepted','published') and updated_at=p_expected_version for update;
 if not found or p_status is null or p_status not in ('submitting','unknown','accepted','published') or jsonb_typeof(p_response) is distinct from 'object' or jsonb_typeof(p_response->'offers') is distinct from 'object' then raise exception 'Family checkpoint changed or invalid';end if;
 if claim.status='published' and p_status<>'published' or p_status='submitting' and claim.status<>'submitting' then raise exception 'Family status cannot regress';end if;
 if (select count(*) from public.catalog_submissions where owner_id=p_owner and organization_id=p_organization and target->>'family_id'=p_id::text and id<>p_id)<>jsonb_array_length(claim.request_payload->'members') then raise exception 'Incomplete durable family';end if;
 if p_status in ('accepted','published') and coalesce(p_response->>'listing_id','')!~'^\d{1,64}$' then raise exception 'Listing ID required';end if;
 for member in select * from public.catalog_submissions where owner_id=p_owner and organization_id=p_organization and target->>'family_id'=p_id::text and id<>p_id order by sku for update loop
  offer_id:=p_response->'offers'->>member.sku;
  if p_status in ('accepted','published') and coalesce(offer_id,'')!~'^\d{1,64}$' then raise exception 'All offer IDs required';end if;
  update public.catalog_submissions set status=p_status,response=coalesce(response,'{}'::jsonb)||jsonb_build_object('stage',p_response->>'stage','offer_id',offer_id,'listing_id',p_response->>'listing_id','trace',p_response->'trace'),updated_at=changed where id=member.id;
 end loop;
 update public.catalog_submissions set status=p_status,response=p_response,updated_at=changed where id=p_id;
 return changed;
end $$;
revoke all on function public.reserve_ebay_family_submission(uuid,uuid,text,jsonb,jsonb,jsonb),public.checkpoint_ebay_family_submission(uuid,uuid,uuid,timestamptz,text,jsonb) from public,anon,authenticated;
grant execute on function public.reserve_ebay_family_submission(uuid,uuid,text,jsonb,jsonb,jsonb),public.checkpoint_ebay_family_submission(uuid,uuid,uuid,timestamptz,text,jsonb) to service_role;
create index catalog_submissions_ebay_family on public.catalog_submissions(organization_id,owner_id,(target->>'family_id')) where channel='ebay-us' and target ? 'family_id';
commit;
