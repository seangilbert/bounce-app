-- Leads: how a customer record first came to exist.
--
-- Until now every `customers` row implied a real interaction — someone booked,
-- or asked a question. Now a person can create an account and SAVE an item
-- without ever contacting the operator, which is a lead: real interest, no
-- conversation yet, and worth the operator seeing.
--
-- `source` is FIRST-TOUCH and never rewritten: someone who saved an item and
-- later booked stays source='saved', because that's the true story of where the
-- relationship started. "Are they a customer yet?" is a different question,
-- answered by whether they have bookings — not by this column.
alter table public.customers
  add column if not exists source text
    check (source is null or source in ('booking', 'inquiry', 'saved'));

comment on column public.customers.source is
  'First touch: how this record was created. Never rewritten — see migration 0048.';

-- Backfill the existing rows so the CRM doesn't show every legacy customer as
-- having an unknown origin. A booking is the stronger signal, so it wins over an
-- inquiry when someone has both.
update public.customers c
   set source = 'booking'
 where c.source is null
   and exists (select 1 from public.bookings b where b.customer_id = c.id);

update public.customers c
   set source = 'inquiry'
 where c.source is null
   and exists (select 1 from public.inquiries i where i.customer_id = c.id);

-- Anything still null predates both (or was created by an import) — leave it
-- null rather than inventing a story for it.
