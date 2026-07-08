-- SMS two-way messaging on inquiries.
--
-- Shared-number model: one platform Twilio number receives every operator's
-- inbound texts, so an inbound message is routed to the right inquiry by the
-- customer's phone number. Store it on the inquiry (set when the SMS thread is
-- bootstrapped) and index it for the inbound-routing lookup. `channel` already
-- exists (free text, default 'website'); SMS inquiries use channel = 'sms'.
alter table public.inquiries add column if not exists customer_phone text;
create index if not exists inquiries_customer_phone_idx on public.inquiries (customer_phone);
