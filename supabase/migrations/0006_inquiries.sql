-- Persisted customer inquiries — the AI Quote Assistant inbox.
--
-- When a customer submits the storefront "Instant quote" box, handleInquiry
-- quotes against live inventory and applies the escalation policy. This table
-- persists that result so the operator Inquiries screen can show the REAL AI
-- draft, quote, and escalation reasons (previously matched from mock content by
-- customer name).
--
-- An inquiry may link to the draft booking it produced (booking_id); that is
-- null when nothing in the message matched the catalog. customer_type/location
-- are optional display hints (the storefront box doesn't collect them yet).

create table if not exists public.inquiries (
  id                 uuid primary key default gen_random_uuid(),
  created_at         timestamptz not null default now(),
  operator_id        uuid not null references public.operators(id) on delete cascade,
  booking_id         uuid references public.bookings(id) on delete set null,
  customer_name      text,
  customer_email     text,
  channel            text not null default 'website',
  inbound_message    text not null,
  start_date         date not null,
  end_date           date not null,
  status             text not null default 'needs_review'
                       check (status in ('needs_review', 'auto', 'replied', 'dismissed')),
  auto               boolean not null default false,
  confidence         text check (confidence in ('high', 'medium', 'low')),
  ai_summary         text,                               -- model's customer-facing draft reply
  escalation_reasons jsonb not null default '[]'::jsonb,
  unmatched_requests jsonb not null default '[]'::jsonb,
  quote              jsonb,                              -- { lineItems, subtotal, suggestedDeposit, currency }
  customer_type      text,                               -- optional display hint ("New customer"/"Returning")
  location           text,                               -- optional display hint
  replied_at         timestamptz
);
create index if not exists inquiries_operator_created_idx on public.inquiries (operator_id, created_at desc);
create index if not exists inquiries_status_idx on public.inquiries (status);

alter table public.inquiries enable row level security;
