-- Multi-day rentals: a booking spans start_date..end_date (inclusive).
--
-- Availability for a range = units owned − the PEAK daily reservation across the
-- range. Peak-daily is correct for fungible units: because a held unit can be
-- reassigned day to day, the only binding constraint is the busiest single day.

alter table public.bookings
  add column if not exists start_date date,
  add column if not exists end_date   date;

update public.bookings set start_date = event_date, end_date = event_date
  where start_date is null;

alter table public.bookings
  alter column start_date set not null,
  alter column end_date set not null;

alter table public.bookings drop constraint if exists bookings_date_order;
alter table public.bookings add constraint bookings_date_order check (end_date >= start_date);

drop index if exists bookings_operator_date_idx;
create index if not exists bookings_operator_range_idx
  on public.bookings (operator_id, start_date, end_date);

alter table public.bookings drop column if exists event_date;

-- Single-date helpers, redefined as range-overlap (a date is the range [d,d]).
create or replace function public.reserved_qty(p_item uuid, p_date date)
returns integer language sql stable as $$
  select coalesce(sum(bi.quantity), 0)::int
  from public.booking_items bi
  join public.bookings b on b.id = bi.booking_id
  where bi.item_id = p_item
    and b.start_date <= p_date and b.end_date >= p_date
    and b.status in ('pending_payment', 'paid', 'contracted', 'confirmed', 'delivered');
$$;

create or replace function public.item_availability(p_operator uuid, p_date date)
returns table (item_id uuid, reserved integer) language sql stable as $$
  select bi.item_id, coalesce(sum(bi.quantity), 0)::int as reserved
  from public.booking_items bi
  join public.bookings b on b.id = bi.booking_id
  where b.operator_id = p_operator
    and b.start_date <= p_date and b.end_date >= p_date
    and b.status in ('pending_payment', 'paid', 'contracted', 'confirmed', 'delivered')
  group by bi.item_id;
$$;

-- Peak reserved units for one item across [p_start, p_end].
create or replace function public.reserved_peak(p_item uuid, p_start date, p_end date)
returns integer language sql stable as $$
  select coalesce(max(daily.reserved), 0)::int
  from (
    select coalesce(sum(bi.quantity), 0) as reserved
    from generate_series(p_start, p_end, interval '1 day') d
    left join public.bookings b
      on b.start_date <= d::date and b.end_date >= d::date
      and b.status in ('pending_payment', 'paid', 'contracted', 'confirmed', 'delivered')
    left join public.booking_items bi
      on bi.booking_id = b.id and bi.item_id = p_item
    group by d
  ) daily;
$$;

-- Peak reserved per item for an operator across [p_start, p_end].
create or replace function public.item_availability_range(p_operator uuid, p_start date, p_end date)
returns table (item_id uuid, reserved integer) language sql stable as $$
  select x.item_id, max(x.daily_reserved)::int as reserved
  from (
    select bi.item_id, d::date as day, sum(bi.quantity) as daily_reserved
    from generate_series(p_start, p_end, interval '1 day') d
    join public.bookings b
      on b.operator_id = p_operator
      and b.start_date <= d::date and b.end_date >= d::date
      and b.status in ('pending_payment', 'paid', 'contracted', 'confirmed', 'delivered')
    join public.booking_items bi on bi.booking_id = b.id
    group by bi.item_id, d
  ) x
  group by x.item_id;
$$;
