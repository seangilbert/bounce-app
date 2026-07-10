-- Discount codes. A promo reduces the items subtotal (pre-tax); one per booking.
create table if not exists promos (
  id uuid primary key default gen_random_uuid(),
  operator_id uuid not null references operators(id) on delete cascade,
  code text not null,
  kind text not null check (kind in ('percent', 'fixed')),
  value integer not null check (value >= 0), -- percent 0-100, or fixed cents
  active boolean not null default true,
  starts_on date,
  ends_on date,
  min_subtotal_cents integer not null default 0,
  usage_limit integer,           -- null = unlimited
  used_count integer not null default 0,
  created_at timestamptz not null default now()
);

-- One code per operator (case-insensitive).
create unique index if not exists promos_operator_code_idx on promos (operator_id, upper(code));
create index if not exists promos_operator_idx on promos (operator_id);

-- Snapshot the applied discount onto the booking (code + resolved amount).
alter table bookings
  add column promo_id uuid references promos(id) on delete set null,
  add column promo_code text,
  add column discount_cents integer not null default 0;
