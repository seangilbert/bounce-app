-- SECURITY HOTFIX. Several tables were created without `enable row level
-- security`, so they relied entirely on the Postgres grant situation to stay
-- private. That is fragile and inconsistent: verified against the live dev DB,
-- the `anon` role (the PUBLIC key, embedded in the browser bundle) could read
-- ALL of `customer_accounts` (every customer's email + name!) and `saved_items`
-- directly via PostgREST — a real PII leak — while other RLS-off tables happened
-- to be protected only by absent grants.
--
-- Enabling RLS with NO policy makes each table DENY-ALL to the anon/authenticated
-- roles (RLS is default-deny). Every one of these tables is accessed by the app
-- ONLY through the service-role client (`createAdminClient`), which BYPASSES RLS
-- entirely — so this closes the leak and breaks nothing. Renter/operator
-- row-level SELECT policies are added per-surface in the RLS phases (0049 did the
-- portal's bookings/orders/booking_items); this is purely the "close the door"
-- baseline.
--
-- api_keys is empty today but holds SECRET key hashes + publishable plaintext —
-- fixing it before it ever holds a row is the whole point of not relying on luck.

alter table public.customer_accounts enable row level security;  -- ← was LEAKING (email/name)
alter table public.saved_items       enable row level security;  -- ← was LEAKING
alter table public.customers         enable row level security;  -- PII + operator notes
alter table public.documents         enable row level security;  -- private files metadata
alter table public.api_keys          enable row level security;  -- SECRET key material
alter table public.promos            enable row level security;
alter table public.operator_ai_usage enable row level security;
alter table public.inquiry_messages  enable row level security;
