-- Stripe Connect: each operator connects their own Stripe (Express) account so
-- their customers' rental payments go to THEM, not the platform.
--
--   stripe_connect_id       — the connected account id (acct_…)
--   connect_charges_enabled — whether Stripe has enabled charges on it
--                             (set after onboarding + on account.updated)

alter table public.operators add column if not exists stripe_connect_id       text;
alter table public.operators add column if not exists connect_charges_enabled boolean not null default false;

create index if not exists operators_connect_idx on public.operators (stripe_connect_id);
