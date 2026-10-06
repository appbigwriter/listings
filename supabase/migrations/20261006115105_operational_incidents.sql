begin;
create table public.catalog_incidents (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null, organization_id uuid not null,
 fingerprint text not null check(fingerprint ~ '^[a-f0-9]{64}$'),
 rule text not null check(rule in ('worker_lease_expired','queue_stalled','submission_uncertain','feed_uncertain','notification_failed','schema_changed','publication_proof_stale')),
 entity_id uuid not null, channel text check(channel in ('amazon-us','ebay-us','walmart-us','tiktok-us')),
 status text not null default 'open' check(status in ('open','acknowledged','resolved')),
 occurrences integer not null default 1 check(occurrences>0),
 first_seen_at timestamptz not null default now(), last_seen_at timestamptz not null default now(),
 evaluated_at timestamptz not null, resolved_at timestamptz, acknowledged_by uuid, acknowledged_at timestamptz,
 unique(owner_id,organization_id,fingerprint)
);
alter table public.catalog_incidents enable row level security;
create policy catalog_incidents_owner_read on public.catalog_incidents for select to authenticated
 using(owner_id=(select auth.uid()) and organization_id=coalesce((auth.jwt()->'app_metadata'->>'organization_id')::uuid,(select auth.uid())));
revoke all on public.catalog_incidents from public,anon,authenticated,service_role;
grant select on public.catalog_incidents to authenticated;
grant select,insert,update on public.catalog_incidents to service_role;
create index catalog_incidents_active on public.catalog_incidents(organization_id,owner_id,status,last_seen_at desc);
create table public.catalog_incident_evaluations(owner_id uuid not null,organization_id uuid not null,evaluated_at timestamptz not null,primary key(owner_id,organization_id));
alter table public.catalog_incident_evaluations enable row level security;
revoke all on public.catalog_incident_evaluations from public,anon,authenticated,service_role;
grant select,insert,update on public.catalog_incident_evaluations to service_role;

create function public.reconcile_catalog_incidents(p_owner uuid,p_organization uuid,p_observed_at timestamptz,p_incidents jsonb) returns jsonb
language plpgsql set search_path='' as $$
declare item jsonb; opened integer:=0; resolved integer:=0; affected integer;
begin
 if p_owner is null or p_organization is null or p_observed_at is null or p_observed_at>now()+interval '5 minutes' or p_observed_at<now()-interval '5 minutes' or jsonb_typeof(p_incidents) is distinct from 'array' or jsonb_array_length(p_incidents)>50000 then raise exception 'Invalid incident evaluation';end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_owner::text||p_organization::text||':incidents',0));
 if exists(select 1 from public.catalog_incident_evaluations where owner_id=p_owner and organization_id=p_organization and evaluated_at>p_observed_at) then raise exception 'Stale incident evaluation';end if;
 insert into public.catalog_incident_evaluations values(p_owner,p_organization,p_observed_at) on conflict(owner_id,organization_id) do update set evaluated_at=p_observed_at;
 if (select count(distinct value->>'fingerprint') from jsonb_array_elements(p_incidents))<>jsonb_array_length(p_incidents) then raise exception 'Duplicate incidents';end if;
 for item in select value from jsonb_array_elements(p_incidents) loop
  if jsonb_typeof(item) is distinct from 'object' or item->>'fingerprint' is null or item->>'rule' is null or item->>'entity_id' is null or exists(select 1 from jsonb_object_keys(item) as key where key not in ('fingerprint','rule','entity_id','channel')) then raise exception 'Invalid incident fields';end if;
  if not exists(select 1 from public.catalog_incidents where owner_id=p_owner and organization_id=p_organization and fingerprint=item->>'fingerprint' and status<>'resolved') then opened:=opened+1;end if;
  insert into public.catalog_incidents(owner_id,organization_id,fingerprint,rule,entity_id,channel,evaluated_at)
  values(p_owner,p_organization,item->>'fingerprint',item->>'rule',(item->>'entity_id')::uuid,item->>'channel',p_observed_at)
  on conflict(owner_id,organization_id,fingerprint) do update set
   last_seen_at=now(),evaluated_at=p_observed_at,
   status=case when catalog_incidents.status='resolved' then 'open' else catalog_incidents.status end,
   occurrences=catalog_incidents.occurrences+case when catalog_incidents.status='resolved' then 1 else 0 end,
   resolved_at=null,
   acknowledged_at=case when catalog_incidents.status='resolved' then null else catalog_incidents.acknowledged_at end,
   acknowledged_by=case when catalog_incidents.status='resolved' then null else catalog_incidents.acknowledged_by end;
 end loop;
 update public.catalog_incidents set status='resolved',resolved_at=now(),evaluated_at=p_observed_at
 where owner_id=p_owner and organization_id=p_organization and status<>'resolved' and fingerprint not in(select value->>'fingerprint' from jsonb_array_elements(p_incidents));
 get diagnostics resolved=row_count;
 return jsonb_build_object('opened',opened,'resolved',resolved,'active',jsonb_array_length(p_incidents));
end $$;
revoke all on function public.reconcile_catalog_incidents(uuid,uuid,timestamptz,jsonb) from public,anon,authenticated;
grant execute on function public.reconcile_catalog_incidents(uuid,uuid,timestamptz,jsonb) to service_role;
commit;
