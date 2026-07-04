-- Orders + webhook idempotency for the payments flow.
--
-- Design notes:
--  * Provider-agnostic: `provider` + `provider_session_id` identify an order
--    across Stripe/Square, mirroring src/lib/payments. Amounts are minor units
--    (cents), same convention as the payment layer's `Money`.
--  * A pending order is created when a checkout session is created; the webhook
--    flips it to `paid`/`failed`/`refunded`. (provider, provider_session_id) is
--    unique so re-creating a session for the same cart is idempotent.
--  * These tables are written only server-side via the service-role key, which
--    bypasses RLS. RLS is enabled with NO policies, so the anon/auth clients
--    (anon key) get zero access by default. Add a SELECT policy later if/when
--    customers need to read their own orders.

create extension if not exists pgcrypto; -- gen_random_uuid()

create table if not exists public.orders (
  id                  uuid primary key default gen_random_uuid(),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  status              text not null default 'pending'
                        check (status in ('pending', 'paid', 'failed', 'refunded')),
  provider            text not null check (provider in ('stripe', 'square')),
  provider_session_id text not null,
  provider_payment_id text,
  amount_total        bigint not null,            -- minor units, e.g. cents
  currency            text not null default 'usd',
  customer_email      text,
  line_items          jsonb not null default '[]'::jsonb,
  metadata            jsonb not null default '{}'::jsonb,
  unique (provider, provider_session_id)
);

create index if not exists orders_status_idx
  on public.orders (status);
create index if not exists orders_payment_id_idx
  on public.orders (provider, provider_payment_id);

-- Idempotency ledger: one row per provider webhook event we've handled.
-- Handlers `claim` an event (insert) before acting; a duplicate delivery hits
-- the primary-key conflict and is skipped.
create table if not exists public.processed_webhook_events (
  provider     text not null,
  event_id     text not null,
  processed_at timestamptz not null default now(),
  primary key (provider, event_id)
);

-- Keep updated_at fresh on any row update.
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists orders_set_updated_at on public.orders;
create trigger orders_set_updated_at
  before update on public.orders
  for each row execute function public.set_updated_at();

alter table public.orders enable row level security;
alter table public.processed_webhook_events enable row level security;
