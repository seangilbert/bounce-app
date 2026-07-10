-- Customer-facing policy text, shown at storefront checkout and in the quote /
-- confirmation emails. Free-form so operators can phrase their own terms.
alter table operators
  add column cancellation_policy text,
  add column damage_policy text;
