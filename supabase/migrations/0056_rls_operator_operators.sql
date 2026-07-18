-- RLS Phase 2 — the operators table itself (the last big group). See docs/rls-plan.md.
--
-- `operators` is the tenant root and holds sensitive columns (stripe_connect_id,
-- stripe_customer_id, stripe_subscription_id, plan, contact/business details).
-- Because RLS is ROW-level, not column-level, we must NOT hand anon/renters a
-- SELECT policy — that would expose every column of the row, including the Stripe
-- ids. The public storefront's operator reads (branding/slug/phone in
-- portal.ts, bookings/repo.ts, delivery preview) therefore STAY on the
-- service-role client, which selects only the public columns in code and bypasses
-- RLS. Same for signup (row created pre-session), Stripe/billing/connect writes,
-- and the webhook — all service role.
--
-- What this adds: the OPERATOR reading + updating their OWN operator row through
-- the user-scoped client, keyed to auth_operator_ids() (all memberships — role is
-- an app-level concern; RLS is only the tenant boundary). SELECT also backs
-- logo.ts's read-before-swap. No INSERT (signup creates the row on the service
-- role) and no DELETE (only the signup rollback deletes, service role).
--
-- operator_members already has RLS enabled with no policy (0008); auth_operator_ids()
-- reads it via SECURITY DEFINER, so it resolves without granting members table
-- access. Session bootstrap + team management keep using the service-role client.

create policy "operator selects own operator" on public.operators
  for select to authenticated
  using (id in (select public.auth_operator_ids()));

create policy "operator updates own operator" on public.operators
  for update to authenticated
  using (id in (select public.auth_operator_ids()))
  with check (id in (select public.auth_operator_ids()));
