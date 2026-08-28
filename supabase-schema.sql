create extension if not exists pgcrypto;
create table if not exists public.prelistings (
  id uuid primary key default gen_random_uuid(),
  sku text not null,
  title text not null,
  brand text not null default 'FBRSigns',
  payload jsonb not null default '{}'::jsonb,
  source_url text,
  source_platform text,
  source_snapshot jsonb,
  status text not null default 'draft' check (status in ('draft','ready','exported')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists prelistings_sku_idx on public.prelistings (sku);
create index if not exists prelistings_status_idx on public.prelistings (status);
-- MVP: configure RLS/auth before using this table with real company data.
