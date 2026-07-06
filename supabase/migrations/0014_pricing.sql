-- Tax + delivery fee. Both default to 0 (current behavior: free delivery, no
-- tax); operators opt in via Settings. Bookings snapshot the amounts + a grand
-- total at creation time, alongside the existing subtotal.

alter table public.operators add column if not exists tax_percent        numeric(5,2) not null default 0;
alter table public.operators add column if not exists delivery_fee_cents bigint       not null default 0;

alter table public.bookings add column if not exists delivery_fee bigint not null default 0;
alter table public.bookings add column if not exists tax_amount   bigint not null default 0;
alter table public.bookings add column if not exists total        bigint;

-- Backfill existing bookings: total = subtotal (+ 0 delivery + 0 tax).
update public.bookings
  set total = subtotal + coalesce(delivery_fee, 0) + coalesce(tax_amount, 0)
  where total is null;
