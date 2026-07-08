-- Atomic inventory reservation to close the overbooking race.
--
-- Bookings are created `quoted` (no hold) and reserve inventory at the
-- `pending_payment` transition (checkout). Previously that was a bare status
-- update, so two simultaneous checkouts for the last unit could both pass the
-- availability check and both reserve. This function makes the check + reserve
-- atomic: it locks the booking's item rows (serializing concurrent reservers on
-- the same items), re-checks peak capacity over the rental range EXCLUDING this
-- booking, and only then flips the status. On oversell it raises
-- `OVERSELL:<item_id>` so the caller can return a clean "sold out" error.

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

  -- Serialize concurrent reservations touching the same items. ORDER BY id to
  -- keep a consistent lock order (avoids deadlocks between multi-item bookings).
  perform 1
    from public.items
    where id in (select item_id from public.booking_items where booking_id = p_booking_id)
    order by id
    for update;

  -- Per item: peak reserved by OTHER committed bookings over [start,end] + this
  -- booking's quantity must not exceed the units owned.
  for r in
    select item_id, sum(quantity)::int as qty
    from public.booking_items
    where booking_id = p_booking_id
    group by item_id
  loop
    select quantity into v_owned from public.items where id = r.item_id;

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

  -- Commit the hold (idempotent: only from quoted/pending_payment).
  update public.bookings
    set status = 'pending_payment', updated_at = now()
    where id = p_booking_id and status in ('quoted', 'pending_payment');
end;
$$;
