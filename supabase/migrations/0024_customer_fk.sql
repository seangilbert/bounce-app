-- Tie bookings + inquiries to the CRM customer record (0023) with a real FK,
-- instead of matching by email/phone at read time. Cleaner joins for stats +
-- activity, and it removes the dedup edge case (email-only vs phone-only). Set
-- on write (upsertCustomer returns the id) and backfilled for existing rows.
-- ON DELETE SET NULL: removing a customer never deletes their bookings.
alter table public.bookings  add column if not exists customer_id uuid references public.customers(id) on delete set null;
alter table public.inquiries add column if not exists customer_id uuid references public.customers(id) on delete set null;
create index if not exists bookings_customer_id_idx  on public.bookings  (customer_id);
create index if not exists inquiries_customer_id_idx on public.inquiries (customer_id);
