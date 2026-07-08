-- Operator CRM: a unified customer record.
--
-- Until now customer identity was denormalized across bookings + inquiries (each
-- carried its own name/email/phone), so a repeat customer was several
-- disconnected rows. This table is the stable per-operator customer entity that
-- the CRM list/profile is built on, and a home for operator-only data (notes).
-- Stats (bookings, spend, activity) are still derived from bookings/inquiries by
-- matching email/phone — a customer_id FK on those tables is a later scaling step.
--
-- Tenancy: per-operator (an operator only ever sees their own customers). A
-- platform-level identity across operators can layer on later for customer
-- self-service login.
create table if not exists public.customers (
  id          uuid primary key default gen_random_uuid(),
  operator_id uuid not null references public.operators(id) on delete cascade,
  name        text,
  email       text,          -- stored lowercased for case-insensitive identity
  phone       text,          -- E.164
  notes       text,          -- operator's private notes
  first_seen  timestamptz not null default now(),
  last_seen   timestamptz not null default now(),
  created_at  timestamptz not null default now()
);

-- Dedup within an operator by email (the primary identity). Phone-only customers
-- are matched in code on upsert (no hard phone constraint, to avoid collisions).
create unique index if not exists customers_operator_email_idx
  on public.customers (operator_id, email) where email is not null;
create index if not exists customers_operator_idx on public.customers (operator_id);
create index if not exists customers_operator_phone_idx
  on public.customers (operator_id, phone) where phone is not null;
