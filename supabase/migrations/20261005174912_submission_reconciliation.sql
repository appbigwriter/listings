begin;
alter table public.catalog_submissions add column request_payload jsonb;
alter table public.catalog_submissions add column target jsonb;
-- An uncertain version must be resolved before any other version of the same SKU.
create unique index catalog_submissions_one_uncertain_version
on public.catalog_submissions(organization_id,owner_id,sku,channel)
where status in ('submitting','unknown');
revoke all on public.catalog_ai_operations from service_role;
grant select,insert,update on public.catalog_ai_operations to service_role;
commit;
