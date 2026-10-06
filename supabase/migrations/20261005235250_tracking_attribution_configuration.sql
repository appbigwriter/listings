begin;
alter table public.tracking_plans add column attribution_tag text check(attribution_tag is null or (length(attribution_tag) between 1 and 512 and attribution_tag !~ '[[:cntrl:]]'));
alter table public.tracking_plans add column attribution_status text not null default 'pending' check(attribution_status in ('pending','configured_unverified'));
alter table public.tracking_plans add constraint tracking_attribution_configured check((attribution_tag is null and attribution_status='pending') or (attribution_tag is not null and attribution_status='configured_unverified'));
commit;
