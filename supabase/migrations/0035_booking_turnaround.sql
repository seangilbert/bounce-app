-- Turnaround / loadout state per booking.
--  * loadout: which required-equipment labels are checked off (persisted ticks).
--  * turnaround: post-return cleaning stage. 'needs_cleaning' holds the booking's
--    units out of availability (bumps items.units_needs_cleaning); 'clean' frees
--    them again. Closes the loop with item readiness.
alter table bookings
  add column loadout jsonb not null default '[]'::jsonb,
  add column turnaround text not null default 'none'
    check (turnaround in ('none', 'needs_cleaning', 'clean'));

-- Move a booking's units into / out of the "needs cleaning" pool atomically.
-- Idempotent: only bumps once (guards on current stage), and clamps so the
-- readiness counts never exceed owned or drop below zero.
create or replace function public.set_booking_turnaround(p_booking_id uuid, p_stage text)
returns void
language plpgsql
as $$
declare
  v_current text;
  r record;
begin
  select turnaround into v_current from public.bookings where id = p_booking_id;
  if not found then
    raise exception 'BOOKING_NOT_FOUND';
  end if;

  if p_stage = 'needs_cleaning' and v_current is distinct from 'needs_cleaning' then
    for r in
      select item_id, sum(quantity)::int as qty
      from public.booking_items where booking_id = p_booking_id group by item_id
    loop
      update public.items
        set units_needs_cleaning =
          least(quantity - units_damaged - units_in_repair, units_needs_cleaning + r.qty)
        where id = r.item_id;
    end loop;
    update public.bookings set turnaround = 'needs_cleaning' where id = p_booking_id;

  elsif p_stage = 'clean' and v_current = 'needs_cleaning' then
    for r in
      select item_id, sum(quantity)::int as qty
      from public.booking_items where booking_id = p_booking_id group by item_id
    loop
      update public.items
        set units_needs_cleaning = greatest(0, units_needs_cleaning - r.qty)
        where id = r.item_id;
    end loop;
    update public.bookings set turnaround = 'clean' where id = p_booking_id;
  end if;
end;
$$;
