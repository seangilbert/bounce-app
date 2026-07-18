-- RLS Phase 2 — finish the operator inquiries surface. See docs/rls-plan.md.
--
-- 0054 already gave operators SELECT on `inquiries` (for the customer-360 view).
-- This adds the matching UPDATE so the whole operator inbox surface can run on
-- the user-scoped client: listInquiries + countNeedsReview (reads) and
-- replyToInquiry + dismissInquiry (status updates) are all operator-only and
-- self-scoped by operator_id — this makes that isolation DB-enforced too.
--
-- Not covered here (stays service-role, by design):
--  * inquiry_messages — the thread READ (listMessagesByInquiry) is SHARED with
--    the Twilio SMS webhook (no session), and the storefront thread read
--    (conversations.ts) is a renter/service-role path; there is no
--    operator-exclusive reader to move. The message INSERTs (createInquiry seed,
--    appendInquiryMessage) are storefront/webhook writes. So inquiry_messages
--    keeps the deny-all baseline + service-role access.
--  * The inquiry create/ingest writes (createInquiry, setInquiryContact,
--    setInquiryPhoneChannel, setInquiryStatus, findLatestInquiryByPhone,
--    linkInquiryToBooking) are storefront/webhook/no-session — service-role.

create policy "operator updates own inquiries" on public.inquiries
  for update to authenticated
  using (operator_id in (select public.auth_operator_ids()))
  with check (operator_id in (select public.auth_operator_ids()));
