-- Phase 0 of docs/inbox-plan.md: AI↔human handoff state.
--
-- `owner` is the handoff state — who is responsible for answering the customer
-- right now — distinct from the lifecycle `status` (needs_review/auto/replied/
-- dismissed), which is unchanged and still drives the existing inbox UI:
--   * ai          — the AI auto-responds to every inbound (today's behavior)
--   * needs_human — the AI escalated and already sent the customer a graceful
--                   acknowledgment; a human needs to pick it up
--   * human       — an operator owns the thread; the AI stays quiet
--
-- Activity timestamps power the "notify once per customer reply burst" rule
-- (notify only when last_customer_at is null or older than last_human_at).

alter table public.inquiries
  add column if not exists owner text not null default 'ai'
    check (owner in ('ai','needs_human','human')),
  add column if not exists last_customer_at timestamptz,
  add column if not exists last_human_at timestamptz;

-- Backfill owner from the lifecycle status. Note the deliberate consequence of
-- replied → human: an old SMS thread where the operator once replied becomes
-- human-owned, so the AI goes silent on it — intended (a reply IS a takeover;
-- the operator is emailed on the customer's next inbound). `dismissed` stays
-- 'ai': it is excluded from SMS routing, storefront resume, and the inbox, so
-- its owner is inert; 'ai' is the least-surprising value if it is ever
-- un-dismissed later.
update public.inquiries
set owner = case status
  when 'needs_review' then 'needs_human'
  when 'replied'      then 'human'
  else 'ai'
end;

-- Best-effort activity backfills.
update public.inquiries set last_human_at = replied_at where replied_at is not null;

update public.inquiries i
set last_customer_at = m.max_at
from (
  select inquiry_id, max(created_at) as max_at
  from public.inquiry_messages
  where sender = 'customer'
  group by inquiry_id
) m
where m.inquiry_id = i.id;

-- The nav badge counts (operator_id, owner='needs_human') on every operator
-- page load.
create index if not exists inquiries_operator_owner_idx
  on public.inquiries (operator_id, owner);

-- Per-message channel + direction (nullable; a conversation will span channels
-- once inbound email / Meta channels land — inbox-plan Phases 1+).
alter table public.inquiry_messages
  add column if not exists channel text,
  add column if not exists direction text
    check (direction in ('inbound','outbound'));

-- Best-effort backfill: direction follows sender; channel follows the parent
-- inquiry's current channel (imprecise for threads that moved web→sms — fine
-- for historical rows).
update public.inquiry_messages
  set direction = case when sender = 'customer' then 'inbound' else 'outbound' end
  where direction is null;

update public.inquiry_messages m
  set channel = i.channel
  from public.inquiries i
  where m.inquiry_id = i.id and m.channel is null;
