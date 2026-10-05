begin;
-- Preserve unassigned historical rows. Identity comes from a separately reviewed mapping.
do $$ declare t text; p record; begin
  foreach t in array array['product_marketing_profiles','amazon_campaign_plans','meta_campaign_plans','tracking_plans','marketing_tasks','marketing_approvals'] loop
    execute format('alter table public.%I add column if not exists owner_id uuid', t);
    execute format('alter table public.%I add column if not exists organization_id uuid', t);
    execute format('alter table public.%I add constraint marketing_new_rows_have_owner check (owner_id is not null and organization_id is not null) not valid', t);
    execute format('create index %I on public.%I (organization_id, owner_id, sku)', t || '_tenant_idx', t);
    execute format('alter table public.%I enable row level security', t);
    for p in select policyname from pg_policies where schemaname='public' and tablename=t loop
      execute format('drop policy %I on public.%I', p.policyname, t);
    end loop;
    execute format('create policy marketing_owner_read on public.%I for select to authenticated using (owner_id = (select auth.uid()) and organization_id = coalesce((auth.jwt()->''app_metadata''->>''organization_id'')::uuid, (select auth.uid())))', t);
    execute format('revoke all on public.%I from public, anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to service_role', t);
  end loop;
end $$;
alter table public.marketing_tasks add column if not exists idempotency_key text;
create unique index marketing_tasks_tenant_idempotency on public.marketing_tasks(organization_id,idempotency_key,task_type);
create unique index marketing_profiles_tenant_sku on public.product_marketing_profiles(organization_id,sku);
create unique index marketing_profiles_identity on public.product_marketing_profiles(id,organization_id,owner_id);
create unique index prelistings_identity on public.prelistings(id,organization_id,owner_id);
alter table public.product_marketing_profiles add constraint marketing_profile_catalog_scope
  foreign key(prelisting_id,organization_id,owner_id) references public.prelistings(id,organization_id,owner_id) not valid;
do $$ declare t text; begin
  foreach t in array array['amazon_campaign_plans','meta_campaign_plans','tracking_plans','marketing_tasks','marketing_approvals'] loop
    execute format('alter table public.%I add constraint marketing_profile_scope foreign key(marketing_profile_id,organization_id,owner_id) references public.product_marketing_profiles(id,organization_id,owner_id) not valid', t);
  end loop;
end $$;
-- Logout invalidates sessions, even while an issued JWT has not expired.
create function public.prelisting_session_active() returns boolean language sql stable security definer
set search_path = '' as $$
  select exists(select 1 from auth.sessions s where s.id = (auth.jwt()->>'session_id')::uuid and s.user_id = auth.uid());
$$;
revoke all on function public.prelisting_session_active() from public, anon;
grant execute on function public.prelisting_session_active() to authenticated;
do $$ begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    revoke all on function public.rls_auto_enable() from public, anon, authenticated;
  end if;
end $$;
commit;
