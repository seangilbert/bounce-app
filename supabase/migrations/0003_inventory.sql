-- Operators + rentable inventory (catalog).
--
-- Single-operator MVP, but operator_id is on every tenant-scoped table from the
-- start so multi-tenant is an additive change, not a rebuild. Amounts are minor
-- units (cents), same convention as payments/orders.

create extension if not exists pgcrypto; -- gen_random_uuid()

create table if not exists public.operators (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  name          text not null,
  contact_email text,
  brand_color   text,
  logo_url      text
);

create table if not exists public.items (
  id             uuid primary key default gen_random_uuid(),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  operator_id    uuid not null references public.operators(id) on delete cascade,
  name           text not null,
  description    text,
  category       text,
  quantity       integer not null default 1 check (quantity >= 0), -- units owned
  base_price     bigint  not null,                                 -- minor units
  price_unit     text    not null default 'per_day'
                   check (price_unit in ('per_day', 'per_hour', 'flat')),
  footprint_w    numeric,  -- feet
  footprint_l    numeric,
  footprint_h    numeric,
  power_required boolean not null default true,
  images         jsonb   not null default '[]'::jsonb,
  active         boolean not null default true
);

create index if not exists items_operator_active_idx
  on public.items (operator_id, active);

-- Reuse the shared updated_at trigger function (created in 0001; idempotent here).
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists items_set_updated_at on public.items;
create trigger items_set_updated_at
  before update on public.items
  for each row execute function public.set_updated_at();

-- Service-role writes only; RLS on with no policies (add public read of active
-- items when the storefront needs the anon client).
alter table public.operators enable row level security;
alter table public.items enable row level security;
