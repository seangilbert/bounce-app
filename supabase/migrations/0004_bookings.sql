-- Bookings aggregate + line items, and the availability functions.
--
-- A booking is the customer's event: date, delivery info, status lifecycle,
-- and the items reserved. The existing `orders` (payment) row links to its
-- booking via booking_id, preserving the verified Stripe/SignWell flow.
--
-- Availability is day-level: a booking reserves inventory on its event_date.
-- delivery_window is free text for now; time-slot precision is additive later.
-- Only committed statuses hold inventory (a mere quote/inquiry does not).

create table if not exists public.bookings (
  id               uuid primary key default gen_random_uuid(),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  operator_id      uuid not null references public.operators(id) on delete cascade,
  customer_name    text,
  customer_email   text,
  event_date       date not null,
  delivery_window  text,
  delivery_address text,
  delivery_zip     text,
  status           text not null default 'quoted'
                     check (status in ('inquiry', 'quoted', 'pending_payment',
                       'paid', 'contracted', 'confirmed', 'delivered',
                       'completed', 'canceled')),
  subtotal         bigint not null default 0,  -- minor units
  deposit          bigint,
  currency         text not null default 'usd',
  notes            text
);
create index if not exists bookings_operator_date_idx on public.bookings (operator_id, event_date);
create index if not exists bookings_status_idx on public.bookings (status);

create table if not exists public.booking_items (
  id         uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  item_id    uuid not null references public.items(id),
  quantity   integer not null check (quantity > 0),
  unit_price bigint not null,   -- minor-unit snapshot at booking time
  line_total bigint not null
);
create index if not exists booking_items_booking_idx on public.booking_items (booking_id);
create index if not exists booking_items_item_idx on public.booking_items (item_id);

-- Link the payment record to its booking.
alter table public.orders add column if not exists booking_id uuid references public.bookings(id);
create index if not exists orders_booking_id_idx on public.orders (booking_id);

drop trigger if exists bookings_set_updated_at on public.bookings;
create trigger bookings_set_updated_at
  before update on public.bookings
  for each row execute function public.set_updated_at();

-- Statuses that hold inventory. Kept in one place: change here to retune what
-- counts as a reservation.
create or replace function public.reserved_qty(p_item uuid, p_date date)
returns integer language sql stable as $$
  select coalesce(sum(bi.quantity), 0)::int
  from public.booking_items bi
  join public.bookings b on b.id = bi.booking_id
  where bi.item_id = p_item
    and b.event_date = p_date
    and b.status in ('pending_payment', 'paid', 'contracted', 'confirmed', 'delivered');
$$;

-- Reserved units per item for an operator on a date (0 rows for unreserved items).
create or replace function public.item_availability(p_operator uuid, p_date date)
returns table (item_id uuid, reserved integer) language sql stable as $$
  select bi.item_id, coalesce(sum(bi.quantity), 0)::int as reserved
  from public.booking_items bi
  join public.bookings b on b.id = bi.booking_id
  where b.operator_id = p_operator
    and b.event_date = p_date
    and b.status in ('pending_payment', 'paid', 'contracted', 'confirmed', 'delivered')
  group by bi.item_id;
$$;

alter table public.bookings enable row level security;
alter table public.booking_items enable row level security;
