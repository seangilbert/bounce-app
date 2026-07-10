-- Whether the delivery fee is part of the taxable base.
-- Some states (e.g. MA) tax rental items but NOT separately-stated delivery.
-- Default true preserves the prior behavior (tax applied to items + delivery).
alter table operators
  add column delivery_taxable boolean not null default true;
