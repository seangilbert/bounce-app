-- Persistent conversation thread for inquiries (Phase 1: outbound).
-- Replaces the single `operator_reply` string with an append-only message
-- thread so operators can keep talking to a customer instead of one-and-done.
-- `sender`: 'customer' (inbound), 'operator' (a sent reply), 'ai' (auto-answer).
-- Phase 2 (inbound webhook/SMS) will append more 'customer' rows here.

create table if not exists public.inquiry_messages (
  id          uuid primary key default gen_random_uuid(),
  inquiry_id  uuid not null references public.inquiries(id) on delete cascade,
  sender      text not null check (sender in ('customer', 'operator', 'ai')),
  body        text not null,
  created_at  timestamptz not null default now()
);

create index if not exists inquiry_messages_inquiry_created_idx
  on public.inquiry_messages (inquiry_id, created_at);

-- Backfill existing inquiries into the thread (idempotent via NOT EXISTS guards).

-- 1) The customer's inbound message.
insert into public.inquiry_messages (inquiry_id, sender, body, created_at)
select i.id, 'customer', i.inbound_message, i.created_at
from public.inquiries i
where coalesce(i.inbound_message, '') <> ''
  and not exists (
    select 1 from public.inquiry_messages m
    where m.inquiry_id = i.id and m.sender = 'customer'
  );

-- 2) The AI's auto-answer (only for auto-handled inquiries — a draft on a
--    needs_review inquiry was never sent, so it stays a suggestion, not a message).
insert into public.inquiry_messages (inquiry_id, sender, body, created_at)
select i.id, 'ai', i.ai_summary, i.created_at
from public.inquiries i
where i.status = 'auto' and coalesce(i.ai_summary, '') <> ''
  and not exists (
    select 1 from public.inquiry_messages m
    where m.inquiry_id = i.id and m.sender = 'ai'
  );

-- 3) The operator's sent reply (if any).
insert into public.inquiry_messages (inquiry_id, sender, body, created_at)
select i.id, 'operator', i.operator_reply, coalesce(i.replied_at, i.created_at)
from public.inquiries i
where coalesce(i.operator_reply, '') <> ''
  and not exists (
    select 1 from public.inquiry_messages m
    where m.inquiry_id = i.id and m.sender = 'operator'
  );
