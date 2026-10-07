-- ProductTypeDefinitionsChangeNotification.NewProductTypes is not an exhaustive
-- list of affected product types. Refresh every owned, active and classified
-- Amazon US listing in the organization; the worker obtains the current schema.
begin;
create or replace function public.enqueue_amazon_schema_event(p_organization uuid,p_notification_id text,p_payload_hash text,p_account_id text,p_product_type_version text,p_event_time timestamptz,p_new_types jsonb) returns jsonb
language plpgsql set search_path='' as $$
declare event_id uuid:=gen_random_uuid();prior public.catalog_schema_events%rowtype;product public.prelistings%rowtype;queued integer:=0;changed timestamptz;
begin
 if p_organization is null or coalesce(p_notification_id,'')!~'^[A-Za-z0-9_-]{1,200}$' or coalesce(p_payload_hash,'')!~'^[a-f0-9]{64}$' or coalesce(p_account_id,'')!~'^[A-Za-z0-9_-]{1,200}$' or coalesce(p_product_type_version,'')!~'^[A-Za-z0-9_-]{1,200}$' or p_event_time is null or jsonb_typeof(p_new_types) is distinct from 'array' or jsonb_array_length(p_new_types)>1000 or exists(select 1 from jsonb_array_elements(p_new_types) where jsonb_typeof(value)<>'string' or (value#>>'{}')!~'^[A-Z][A-Z0-9_]{0,199}$') then raise exception 'Invalid schema notification';end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_organization::text||':schema-events',0));
 select * into prior from public.catalog_schema_events where organization_id=p_organization and notification_id=p_notification_id;
 if found then
  if prior.payload_hash<>p_payload_hash or prior.account_id<>p_account_id then raise exception 'Conflicting duplicate schema event';end if;
  return jsonb_build_object('id',prior.id,'status',prior.status,'queued_jobs',prior.queued_jobs,'duplicate',true);
 end if;
 lock table public.prelistings in share row exclusive mode;
 if (select count(*) from public.prelistings where organization_id=p_organization and owner_id is not null and status<>'archived' and coalesce(payload#>>'{_catalog,channels,amazon-us,product_type}','')<>'')>5000 then raise exception 'Schema refresh population exceeds limit';end if;
 for product in select * from public.prelistings where organization_id=p_organization and owner_id is not null and status<>'archived' and coalesce(payload#>>'{_catalog,channels,amazon-us,product_type}','')<>'' order by sku for update loop
  -- Only notification-created jobs which have not started may be superseded.
  -- Manual schema jobs and running jobs retain their original audit trail.
  update public.catalog_jobs set status='cancelled',results=results||jsonb_build_array(jsonb_build_object('status','cancelled','code','schema_event_superseded','at',clock_timestamp())),updated_at=clock_timestamp()
   where organization_id=p_organization and owner_id=product.owner_id and kind='schema' and status='pending'
     and payload ? 'schema_event_id' and payload->'skus' ? product.sku;
  update public.prelistings set payload=jsonb_set(payload,'{_catalog,channels,amazon-us,schema_refresh_pending}',jsonb_build_object('event_id',event_id,'requested_at',now(),'product_type_version',p_product_type_version),true),updated_at=clock_timestamp() where id=product.id returning updated_at into changed;
  insert into public.catalog_jobs(owner_id,organization_id,kind,idempotency_key,payload,total)
  values(product.owner_id,p_organization,'schema','schema-event:'||event_id::text||':'||product.id::text,jsonb_build_object('skus',jsonb_build_array(product.sku),'versions',jsonb_build_object(product.sku,changed),'channel','amazon-us','schema_event_id',event_id),1);
  queued:=queued+1;
 end loop;
 insert into public.catalog_schema_events(id,organization_id,notification_id,payload_hash,account_id,marketplace_id,product_type_version,event_time,status,queued_jobs)
 values(event_id,p_organization,p_notification_id,p_payload_hash,p_account_id,'ATVPDKIKX0DER',p_product_type_version,p_event_time,case when queued=0 then 'ignored' else 'queued' end,queued);
 return jsonb_build_object('id',event_id,'status',case when queued=0 then 'ignored' else 'queued' end,'queued_jobs',queued,'duplicate',false);
end $$;
revoke all on function public.enqueue_amazon_schema_event(uuid,text,text,text,text,timestamptz,jsonb) from public,anon,authenticated;
grant execute on function public.enqueue_amazon_schema_event(uuid,text,text,text,text,timestamptz,jsonb) to service_role;
commit;

