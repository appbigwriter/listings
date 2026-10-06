begin;
alter table public.catalog_assets add column scan_status text not null default 'pending' check(scan_status in ('pending','clean','skipped','rejected'));
alter table public.catalog_assets add column scan_checked_at timestamptz;
alter table public.catalog_assets add column scan_receipt jsonb;
alter table public.catalog_assets add constraint catalog_assets_scan_receipt_required check(scan_status='pending' or (scan_checked_at is not null and scan_receipt is not null and jsonb_typeof(scan_receipt)='object'));
commit;
