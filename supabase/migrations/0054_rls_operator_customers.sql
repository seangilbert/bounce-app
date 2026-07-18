-- RLS Phase 2 — operator customer-360 view. See docs/rls-plan.md.
--
-- The biggest operator read surface so far: the Customers section reads a
-- customer's PII (name/email/phone/notes) plus their full activity — bookings,
-- line items, item names, inquiries, and payment (orders) history. Today that
-- runs on the service-role client, isolated only by hand-written
-- `.eq("operator_id", …)` filters. This phase adds DB-enforced operator SELECT
-- policies on every table that view reads, so a forgotten filter (or an operator
-- hitting PostgREST directly with their JWT) can't read another tenant's
-- customers or their history.
--
-- These are PERMISSIVE policies layered alongside the renter policies from 0049;
-- Postgres OR-combines them, so a renter still matches the renter policy and an
-- operator matches the operator policy — neither sees the other's rows. The
-- no-session paths (storefront checkout, the Quote Assistant's upsertCustomer,
-- webhooks) all use the service-role client, which BYPASSES RLS, so they are
-- unaffected. auth_operator_ids() (0051) resolves the caller's operators.

-- customers: the operator reads + updates (notes) their own customer records.
-- SELECT also backs the `.select()` that update/insert paths return. No operator
-- INSERT policy — new customers are created by upsertCustomer on the service-role
-- client (storefront/inquiry flows have no operator session). No DELETE — the app
-- never deletes customers.
create policy "operator selects own customers" on public.customers
  for select to authenticated
  using (operator_id in (select public.auth_operator_ids()));

create policy "operator updates own customers" on public.customers
  for update to authenticated
  using (operator_id in (select public.auth_operator_ids()))
  with check (operator_id in (select public.auth_operator_ids()));

-- bookings + their line items + item catalog: the customer view embeds
-- `booking_items(items(name))`, and PostgREST applies RLS to each embedded
-- resource, so all three need an operator SELECT policy or the embeds come back
-- empty. Keyed to the operator directly (bookings/items carry operator_id) or
-- through the parent booking (booking_items does not).
create policy "operator selects own bookings" on public.bookings
  for select to authenticated
  using (operator_id in (select public.auth_operator_ids()));

create policy "operator selects own items" on public.items
  for select to authenticated
  using (operator_id in (select public.auth_operator_ids()));

create policy "operator selects own booking_items" on public.booking_items
  for select to authenticated
  using (
    booking_id in (
      select id from public.bookings where operator_id in (select public.auth_operator_ids())
    )
  );

-- orders (payment history) for the operator's bookings, scoped through bookings
-- the same way the renter policy is — one source of truth for "own".
create policy "operator selects own orders" on public.orders
  for select to authenticated
  using (
    booking_id in (
      select id from public.bookings where operator_id in (select public.auth_operator_ids())
    )
  );

-- inquiries (the customer's message history on the activity view).
create policy "operator selects own inquiries" on public.inquiries
  for select to authenticated
  using (operator_id in (select public.auth_operator_ids()));
