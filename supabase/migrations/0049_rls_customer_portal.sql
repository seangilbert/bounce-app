-- RLS Phase 1 — renter portal (`/my`). See docs/rls-plan.md.
--
-- Adds DATABASE-ENFORCED isolation for the renter portal's booking reads, so a
-- forgotten app-level filter (or a renter hitting PostgREST directly with their
-- JWT) can't read another person's bookings. This is defense-in-depth: the app
-- still scopes too; this is the net underneath.
--
-- SCOPE: the renter (an `authenticated` JWT that IS a `customer_accounts.id`)
-- gets SELECT on the bookings/orders/booking_items they own. Nothing else
-- changes: the operator app + storefront + webhooks + guest checkout all use the
-- service-role client, which BYPASSES RLS entirely, so they're unaffected.
-- Operator policies + the rest are later RLS phases.

-- Which `customers` rows the current auth user owns. SECURITY DEFINER so it can
-- read `customers` regardless of that table's own (operator-only, later) RLS —
-- this is what lets the renter be scoped WITHOUT ever being granted read access
-- to `customers` itself, so `customers.notes` (operator-private) can't leak.
-- `auth.uid()` inside a definer function still returns the CALLER's id (it reads
-- the request JWT), so this is correctly per-renter.
create or replace function public.auth_customer_ids()
  returns setof uuid
  language sql
  stable
  security definer
  set search_path = public
as $$
  select id from public.customers where account_id = auth.uid()
$$;

revoke all on function public.auth_customer_ids() from public;
grant execute on function public.auth_customer_ids() to authenticated;

-- A renter reads only the bookings tied to a customers row they own.
-- (bookings already has RLS enabled with no policy; this is purely additive.)
create policy "renter reads own bookings" on public.bookings
  for select to authenticated
  using (customer_id in (select public.auth_customer_ids()));

-- ...and the orders + line items of those bookings. Scoped through bookings so
-- there's one source of truth for "own".
create policy "renter reads own orders" on public.orders
  for select to authenticated
  using (
    booking_id in (
      select id from public.bookings where customer_id in (select public.auth_customer_ids())
    )
  );

create policy "renter reads own booking_items" on public.booking_items
  for select to authenticated
  using (
    booking_id in (
      select id from public.bookings where customer_id in (select public.auth_customer_ids())
    )
  );
