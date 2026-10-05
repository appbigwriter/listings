-- Supabase default privileges may grant ALL to authenticated on new tables.
-- RLS does not cover TRUNCATE. Explicitly revoke defaults before granting reads.
begin;
revoke all on public.catalog_jobs, public.catalog_submissions from public, anon, authenticated;
grant select on public.catalog_jobs, public.catalog_submissions to authenticated;
grant select, insert, update, delete on public.catalog_jobs, public.catalog_submissions to service_role;
commit;
