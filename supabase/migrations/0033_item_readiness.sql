-- Item readiness (aggregate condition counts). Units in a non-ready condition
-- are held OUT of bookable inventory. "Clean / ready" is the implicit remainder:
--   bookable = quantity - needs_cleaning - damaged - in_repair
-- Default 0 = every unit ready (no change to existing items).
alter table items
  add column units_needs_cleaning integer not null default 0 check (units_needs_cleaning >= 0),
  add column units_damaged integer not null default 0 check (units_damaged >= 0),
  add column units_in_repair integer not null default 0 check (units_in_repair >= 0),
  add constraint items_out_of_service_within_owned
    check (units_needs_cleaning + units_damaged + units_in_repair <= quantity);

-- Reservation guard must book against the READY ceiling, not raw units owned.
create or replace function public.reserve_booking(p_booking_id uuid)
returns void
language plpgsql
as $$
declare
  v_start date;
  v_end   date;
  r       record;
  v_owned int;
  v_peak  int;
begin
  select start_date, end_date into v_start, v_end
    from public.bookings where id = p_booking_id;
  if not found then
    raise exception 'BOOKING_NOT_FOUND';
  end if;

  perform 1
    from public.items
    where id in (select item_id from public.booking_items where booking_id = p_booking_id)
    order by id
    for update;

  for r in
    select item_id, sum(quantity)::int as qty
    from public.booking_items
    where booking_id = p_booking_id
    group by item_id
  loop
    -- Ready units = owned minus anything out of service.
    select quantity
             - coalesce(units_needs_cleaning, 0)
             - coalesce(units_damaged, 0)
             - coalesce(units_in_repair, 0)
      into v_owned
      from public.items where id = r.item_id;

    select coalesce(max(daily.reserved), 0)::int into v_peak
    from (
      select coalesce(sum(bi.quantity), 0) as reserved
      from generate_series(v_start, v_end, interval '1 day') d
      left join public.bookings b
        on b.start_date <= d::date and b.end_date >= d::date
        and b.id <> p_booking_id
        and b.status in ('pending_payment', 'paid', 'contracted', 'confirmed', 'delivered')
      left join public.booking_items bi
        on bi.booking_id = b.id and bi.item_id = r.item_id
      group by d
    ) daily;

    if v_peak + r.qty > coalesce(v_owned, 0) then
      raise exception 'OVERSELL:%', r.item_id;
    end if;
  end loop;

  update public.bookings
    set status = 'pending_payment', updated_at = now()
    where id = p_booking_id and status in ('quoted', 'pending_payment');
end;
$$;
