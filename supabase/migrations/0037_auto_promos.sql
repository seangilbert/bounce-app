-- Automatic (codeless) promos. `trigger` distinguishes a typed code from a rule
-- that applies on its own: 'weekday' (rental day falls on one of `weekdays`) or
-- 'repeat' (returning customer). Existing rows default to 'code'.
alter table promos
  add column trigger text not null default 'code' check (trigger in ('code', 'weekday', 'repeat')),
  add column weekdays integer[] not null default '{}';
