-- RLS Phase 2 (defense-in-depth) — operator own-row policies. See docs/rls-plan.md.
--
-- The deny-all baseline (0050) already protects every table; the operator app
-- keeps working because it queries via the service-role client (bypasses RLS).
-- This phase lets the OPERATOR read/write their OWN rows through the user-scoped
-- client, so tenant isolation is DB-enforced — a forgotten `operator_id` filter
-- can no longer cross tenants. First group: `api_keys` (holds secret key
-- material; the highest-value operator table).

-- The operator_ids the current auth user belongs to. SECURITY DEFINER so it can
-- read operator_members cleanly regardless of that table's own RLS; STABLE so
-- the planner caches it per statement; pinned search_path (injection guard).
-- Per-user via auth.uid() (the caller's JWT, even inside a definer function).
create or replace function public.auth_operator_ids()
  returns setof uuid
  language sql
  stable
  security definer
  set search_path = public
as $$
  select operator_id from public.operator_members where user_id = auth.uid()
$$;

revoke all on function public.auth_operator_ids() from public;
grant execute on function public.auth_operator_ids() to authenticated;

-- api_keys: full CRUD scoped to the operators the user is a member of. The
-- public-API auth path (resolveOperatorByKey) stays on the service role, which
-- bypasses RLS entirely, so it's unaffected.
create policy "operator selects own api_keys" on public.api_keys
  for select to authenticated
  using (operator_id in (select public.auth_operator_ids()));

create policy "operator inserts own api_keys" on public.api_keys
  for insert to authenticated
  with check (operator_id in (select public.auth_operator_ids()));

create policy "operator updates own api_keys" on public.api_keys
  for update to authenticated
  using (operator_id in (select public.auth_operator_ids()))
  with check (operator_id in (select public.auth_operator_ids()));

create policy "operator deletes own api_keys" on public.api_keys
  for delete to authenticated
  using (operator_id in (select public.auth_operator_ids()));
