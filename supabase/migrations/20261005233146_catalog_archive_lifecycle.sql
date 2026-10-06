begin;
create function public.set_catalog_archive(p_owner uuid,p_organization uuid,p_sku text,p_version timestamptz,p_archive boolean,p_reason text) returns jsonb
language plpgsql set search_path='' as $$
declare product public.prelistings%rowtype; channels jsonb;
begin
 if p_archive is null or p_reason is null or length(trim(p_reason))<5 or length(p_reason)>1000 then raise exception 'Archive reason required';end if;
 select * into product from public.prelistings where owner_id=p_owner and organization_id=p_organization and sku=p_sku and updated_at=p_version for update;
 if not found then raise exception 'Product version changed';end if;
 if p_archive=(product.status='archived') then raise exception 'Lifecycle already changed';end if;
 if exists(select 1 from public.catalog_submissions where owner_id=p_owner and organization_id=p_organization and sku=p_sku and status in ('submitting','unknown'))
 or exists(select 1 from public.catalog_submissions s join public.catalog_feeds f on f.id=s.feed_batch_id where s.owner_id=p_owner and s.organization_id=p_organization and s.sku=p_sku and f.status in ('preparing','uploading','submitting','processing','unknown')) then raise exception 'Reconcile active or uncertain submissions before archiving';end if;
 select coalesce(jsonb_object_agg(key,value-'approval'-'report'),'{}'::jsonb) into channels from jsonb_each(coalesce(product.payload#>'{_catalog,channels}','{}'::jsonb));
 update public.prelistings set status=case when p_archive then 'archived' else 'draft' end,archived_at=case when p_archive then clock_timestamp() else null end,human_reviewed=false,
 payload=jsonb_set(product.payload,'{_catalog,channels}',channels)||jsonb_build_object('human_reviewed',false,'archive_transition',jsonb_build_object('archived',p_archive,'reason',trim(p_reason),'actor',p_owner,'at',clock_timestamp())),updated_at=clock_timestamp()
 where id=product.id returning * into product;
 return jsonb_build_object('sku',product.sku,'status',product.status,'updated_at',product.updated_at,'archived_at',product.archived_at);
end $$;
revoke all on function public.set_catalog_archive(uuid,uuid,text,timestamptz,boolean,text) from public,anon,authenticated;
grant execute on function public.set_catalog_archive(uuid,uuid,text,timestamptz,boolean,text) to service_role;
commit;
