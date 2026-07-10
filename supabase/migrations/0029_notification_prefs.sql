-- Per-operator notification preferences. Which operator-directed emails fire.
-- Default true = current behavior (all notifications on).
alter table operators
  add column notify_new_inquiry boolean not null default true,
  add column notify_new_booking boolean not null default true,
  add column notify_balance_paid boolean not null default true,
  add column notify_contract_signed boolean not null default true;
