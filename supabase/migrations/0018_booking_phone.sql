-- Persist the customer phone captured at checkout (was collected but dropped).
-- Powers call/text from the driver daily route.
alter table public.bookings add column if not exists customer_phone text;
