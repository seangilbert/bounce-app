-- RLS Phase 2 group 2 — promos (operator promo management). Same recipe as
-- api_keys (0051); auth_operator_ids() already exists. Operator does full CRUD
-- on their own promos. The booking-flow reads — applyPromo / resolveBookingDiscount
-- / redeemPromoForBooking / incrementPromoUsage — run in the storefront/checkout/
-- webhook context (no operator session) and STAY on the service role, which
-- bypasses RLS.
create policy "operator selects own promos" on public.promos
  for select to authenticated
  using (operator_id in (select public.auth_operator_ids()));

create policy "operator inserts own promos" on public.promos
  for insert to authenticated
  with check (operator_id in (select public.auth_operator_ids()));

create policy "operator updates own promos" on public.promos
  for update to authenticated
  using (operator_id in (select public.auth_operator_ids()))
  with check (operator_id in (select public.auth_operator_ids()));

create policy "operator deletes own promos" on public.promos
  for delete to authenticated
  using (operator_id in (select public.auth_operator_ids()));
