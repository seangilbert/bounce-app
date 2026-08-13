-- Follow-up agent v2: stale-quote nudges + document-expiry reminders.
--
-- remind_quote joins remind_balance/remind_contract (0061): a customer-facing
-- automated email, so it defaults FALSE (explicit opt-in from Settings).
-- notify_doc_expiry joins the notify_* family (0029): it emails the OPERATOR
-- about their own paperwork, so it defaults TRUE like its siblings.
alter table public.operators
  add column if not exists remind_quote boolean not null default false,
  add column if not exists notify_doc_expiry boolean not null default true;

-- The moment a quote actually went to the customer (operator "link" mode
-- emails a /pay link). The quote-nudge lane only targets bookings where this
-- is set — storefront-created `quoted` rows abandoned before checkout never
-- received anything to be reminded OF, so they stay untouched.
alter table public.bookings
  add column if not exists quote_sent_at timestamptz;

-- Third reminder kind for the booking_reminders send-log.
alter table public.booking_reminders
  drop constraint if exists booking_reminders_kind_check;
alter table public.booking_reminders
  add constraint booking_reminders_kind_check
  check (kind in ('balance', 'contract', 'quote'));

-- Send-log for document-expiry reminders, mirroring booking_reminders (0061):
-- claim-before-send concurrency + ONE reminder per (document, expiry date) —
-- renewing a document (a new expires_at) re-arms the reminder for the new date.
-- Writes are service-role only (the cron sweep has no user session).
create table if not exists public.document_reminders (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  operator_id uuid not null references public.operators(id) on delete cascade,
  expires_at date not null,
  sent_at timestamptz not null default now(),
  unique (document_id, expires_at)
);

create index if not exists document_reminders_operator_idx
  on public.document_reminders(operator_id);

alter table public.document_reminders enable row level security;

create policy "operator selects own document reminders" on public.document_reminders
  for select to authenticated
  using (operator_id in (select public.auth_operator_ids()));
