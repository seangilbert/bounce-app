-- Inbox Phase 2 — live streaming inbox (Supabase Realtime).
--
-- 1) Operator SELECT on inquiry_messages. postgres_changes enforces RLS per
--    subscriber, so realtime delivery of thread messages REQUIRES a read
--    policy. This is the FIRST policy on the table since the 0050 deny-all
--    baseline — and it changes nothing for existing readers: every current
--    read/write path (listMessagesByInquiry, storefront resume in
--    conversations.ts, the webhooks) is service-role and bypasses RLS.
--    Renters are `authenticated` too, but auth_operator_ids() resolves
--    operator_members only, so for them the subquery is empty → zero rows.
create policy "operator selects own inquiry messages" on public.inquiry_messages
  for select to authenticated
  using (
    inquiry_id in (
      select id from public.inquiries
      where operator_id in (select public.auth_operator_ids())
    )
  );

-- 2) Publication membership. No migration has ever managed supabase_realtime
--    and the dashboard toggle state is unknown per project, so use the
--    idempotent guard — managed here so dev + prod stay in lockstep via
--    scripts/db-migrate.sh, no dashboard clicking.
do $$
begin
  alter publication supabase_realtime add table public.inquiries;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.inquiry_messages;
exception when duplicate_object then null;
end $$;
