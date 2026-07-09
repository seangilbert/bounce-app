-- Allow cash-recorded payments as orders, so the operator's "Mark paid (cash)"
-- and a manual booking's recorded cash deposit show up in the payment history +
-- count toward "Collected" (net cash) on the customer record — alongside Stripe.
alter table public.orders drop constraint if exists orders_provider_check;
alter table public.orders add constraint orders_provider_check
  check (provider in ('stripe', 'square', 'cash'));
