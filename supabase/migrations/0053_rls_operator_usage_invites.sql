-- RLS Phase 2 groups 3+4 — operator_ai_usage (read) + operator_invites (manage).
-- Same recipe; auth_operator_ids() exists (0051).

-- operator_ai_usage: the operator READS their own monthly counter (Settings).
-- Writes go through the increment_ai_usage RPC on the service role (during a
-- customer inquiry, no operator session), so only a SELECT policy is needed.
create policy "operator selects own ai_usage" on public.operator_ai_usage
  for select to authenticated
  using (operator_id in (select public.auth_operator_ids()));

-- operator_invites: the operator manages invites for operators they belong to.
-- The PUBLIC invite-acceptance path (getInviteByToken / acceptInvite — the
-- invitee is not a member yet) stays on the service role, which bypasses RLS.
create policy "operator selects own invites" on public.operator_invites
  for select to authenticated
  using (operator_id in (select public.auth_operator_ids()));
create policy "operator inserts own invites" on public.operator_invites
  for insert to authenticated
  with check (operator_id in (select public.auth_operator_ids()));
create policy "operator updates own invites" on public.operator_invites
  for update to authenticated
  using (operator_id in (select public.auth_operator_ids()))
  with check (operator_id in (select public.auth_operator_ids()));
