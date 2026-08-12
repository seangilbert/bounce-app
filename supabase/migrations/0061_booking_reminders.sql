-- Follow-up agent v1 (the app's first cron: /api/cron/reminders).
--
-- Two per-operator opt-in toggles for customer-facing automated emails.
-- They default FALSE — a deliberate contrast with the notify_* columns
-- (0029), which default true: those email the OPERATOR about their own
-- business; these email the operator's CUSTOMERS unprompted, so they must
-- be an explicit opt-in from Settings → Automated follow-ups.
alter table public.operators
  add column if not exists remind_balance boolean not null default false,
  add column if not exists remind_contract boolean not null default false;

-- The send-log. Serves two jobs at once:
--   1. Policy: ONE reminder per booking per kind, ever (unique constraint).
--   2. Concurrency: the sweep INSERTs here BEFORE sending (claim-first, like
--      processed_webhook_events) — a 23505 unique violation means another
--      run already owns/sent it. A failed send deletes its claim so the
--      next run retries.
-- Writes are service-role only (the cron job has no user session);
-- operators get read-only visibility via RLS.
create table if not exists public.booking_reminders (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  operator_id uuid not null references public.operators(id) on delete cascade,
  kind text not null check (kind in ('balance', 'contract')),
  sent_at timestamptz not null default now(),
  unique (booking_id, kind)
);

create index if not exists booking_reminders_operator_idx
  on public.booking_reminders(operator_id);

alter table public.booking_reminders enable row level security;

create policy "operator selects own booking reminders" on public.booking_reminders
  for select to authenticated
  using (operator_id in (select public.auth_operator_ids()));
