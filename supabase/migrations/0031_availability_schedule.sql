-- Operator availability: which weekdays they deliver, named delivery windows
-- customers pick at checkout, and blackout date ranges that can't be booked.
-- Empty {} = all days open, no windows, no blackouts (current behavior).
alter table operators
  add column availability_config jsonb not null default '{}'::jsonb;
