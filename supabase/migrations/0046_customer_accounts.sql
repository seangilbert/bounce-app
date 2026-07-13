-- Customer self-service: a platform-level identity for the person renting.
--
-- `customers` (0023) is deliberately PER-OPERATOR — one row per (operator,
-- person), because it also carries operator-private data (notes). But the same
-- human can rent from several operators, and when they log in to see "my
-- bookings" they expect ONE list, not one per operator.
--
-- So this table is the person: one row per real human, keyed 1:1 to a Supabase
-- auth user, identified by a VERIFIED email (they proved it via an emailed
-- one-time code). `customers.account_id` then links each per-operator record
-- back to the human who owns it — "claimed" on first successful login by
-- matching the verified email.
--
-- Principal separation: an auth user is an OPERATOR user iff it has an
-- `operator_members` row, and a CUSTOMER iff it has a row here. The two are
-- independent — the same email could in principle be both (an operator who also
-- rents from someone else), and nothing here forbids that.
create table if not exists public.customer_accounts (
  -- 1:1 with the auth user. Cascade: deleting the login deletes the account
  -- (the per-operator `customers` rows survive — they're the operator's CRM
  -- data, not the login's; `account_id` just goes null).
  id            uuid primary key references auth.users(id) on delete cascade,
  -- Lowercased + verified. Unique: one account per email, platform-wide.
  email         text not null unique,
  name          text,
  created_at    timestamptz not null default now(),
  last_login_at timestamptz
);

-- Link each per-operator customer record to the human who owns it.
-- `on delete set null` (not cascade): if a login is deleted, the operator KEEPS
-- their CRM record — it just becomes unclaimed again. Customer data belongs to
-- the operator; only the login belongs to the platform.
alter table public.customers
  add column if not exists account_id uuid references public.customer_accounts(id) on delete set null;

-- The portal's hot path: "every customer record owned by this account", which
-- fans out to their bookings across all operators.
create index if not exists customers_account_idx
  on public.customers (account_id) where account_id is not null;
