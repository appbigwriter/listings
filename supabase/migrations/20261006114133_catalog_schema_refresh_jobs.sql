-- Refresh requirements through the same durable, scoped queue as preparation.
alter table public.catalog_jobs drop constraint catalog_jobs_kind_check;
alter table public.catalog_jobs add constraint catalog_jobs_kind_check
 check (kind in ('import','classify','generate','validate','media','monitor','schema'));
