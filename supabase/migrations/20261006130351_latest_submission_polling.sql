begin;
create index catalog_submissions_latest on public.catalog_submissions(organization_id,owner_id,sku,channel,created_at desc,id desc);
create view public.catalog_latest_submissions with (security_invoker=true) as
 select distinct on (organization_id,owner_id,sku,channel) * from public.catalog_submissions
 order by organization_id,owner_id,sku,channel,created_at desc,id desc;
revoke all on public.catalog_latest_submissions from public,anon,authenticated,service_role;
grant select on public.catalog_latest_submissions to service_role;
commit;
