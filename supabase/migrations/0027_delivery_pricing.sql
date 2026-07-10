-- Flexible delivery pricing: flat (existing), zones (by town/ZIP), or distance
-- (miles from the operator's storage location). Mode-specific config lives in a
-- JSONB blob; the existing delivery_fee_cents is reused as the flat fee AND the
-- distance-mode base fee. Per-booking override lets an operator set an explicit
-- fee on any single booking.
alter table operators
  add column delivery_mode text not null default 'flat'
    check (delivery_mode in ('flat', 'zones', 'distance')),
  add column delivery_config jsonb not null default '{}'::jsonb;

alter table bookings
  add column delivery_fee_override_cents integer;
