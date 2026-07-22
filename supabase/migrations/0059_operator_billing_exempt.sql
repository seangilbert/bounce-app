-- Comp / internal accounts: an operator flagged billing_exempt is always
-- entitled to the top tier regardless of any Stripe subscription state, and is
-- never charged. Set ONLY via admin/DB (never operator-editable). effectivePlanId
-- short-circuits on this flag, so even a missed/late billing webhook can't
-- downgrade a comp account; the checkout route also refuses to bill it.
alter table operators
  add column billing_exempt boolean not null default false;
