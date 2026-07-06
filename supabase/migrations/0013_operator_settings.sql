-- Operator-configurable settings that used to be hardcoded constants: deposit
-- percentage, auto-quote cap, and minimum lead time. Plus a contact phone.

alter table public.operators add column if not exists phone text;
alter table public.operators add column if not exists deposit_percent integer not null default 30
  check (deposit_percent between 0 and 100);
alter table public.operators add column if not exists auto_quote_cap_cents bigint not null default 75000;
alter table public.operators add column if not exists min_lead_hours integer not null default 48;
