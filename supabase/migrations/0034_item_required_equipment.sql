-- Per-item required equipment (loadout checklist): the gear needed to run each
-- item (blower, stakes, tarp, cords…). Array of { label, qty }. Shown on the
-- deliveries screen, aggregated per stop. Default [] = nothing required.
alter table items
  add column required_equipment jsonb not null default '[]'::jsonb;
