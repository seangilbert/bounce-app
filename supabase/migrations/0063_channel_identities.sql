-- Inbox Phase 2 — cross-channel identity.
--
-- An additive resolution layer: which external handles (phone / email) map to
-- which CRM customer. Widens inbound webhook routing beyond "the handle
-- happens to be denormalized onto an inquiry" — e.g. a customer whose phone
-- was captured at booking checkout can now text in and land on their thread.
-- Written best-effort from upsertCustomer (single choke point); read by the
-- Twilio/Resend routing fallbacks. NO historical merge of duplicate customer
-- rows here (explicit follow-up) — identity rows simply cover all matches.
create table if not exists public.channel_identities (
  id           uuid primary key default gen_random_uuid(),
  operator_id  uuid not null references public.operators(id) on delete cascade,
  customer_id  uuid not null references public.customers(id) on delete cascade,
  channel      text not null check (channel in ('sms', 'email')),
  external_id  text not null, -- E.164 phone or lowercased email
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique (operator_id, channel, external_id)
);

-- Global lookup path for the shared-Twilio-number model, where no operator is
-- known at routing time.
create index if not exists channel_identities_channel_external_idx
  on public.channel_identities (channel, external_id);

alter table public.channel_identities enable row level security;

-- Operator can read their own identity mappings. All writes stay service-role
-- (webhook / storefront paths have no session).
create policy "operator selects own channel identities" on public.channel_identities
  for select to authenticated
  using (operator_id in (select public.auth_operator_ids()));

-- Backfill from the existing customers table so the routing fallbacks cover
-- pre-deploy customers, not just new activity. Mirrors exactly what
-- upsertCustomer would have recorded. Idempotent.
insert into public.channel_identities (operator_id, customer_id, channel, external_id, created_at, last_seen_at)
select operator_id, id, 'email', lower(email), first_seen, last_seen
from public.customers
where email is not null
on conflict (operator_id, channel, external_id) do nothing;

insert into public.channel_identities (operator_id, customer_id, channel, external_id, created_at, last_seen_at)
select operator_id, id, 'sms', phone, first_seen, last_seen
from public.customers
where phone is not null
on conflict (operator_id, channel, external_id) do nothing;
