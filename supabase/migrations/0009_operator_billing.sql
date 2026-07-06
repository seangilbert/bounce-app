-- Operator subscription billing (Stripe). `plan` already exists (0007); this
-- adds the Stripe linkage + status so we know whether a paid operator is
-- trialing/active/past_due/canceled.

alter table public.operators add column if not exists stripe_customer_id     text;
alter table public.operators add column if not exists stripe_subscription_id text;
-- null for Free; otherwise trialing | active | past_due | canceled | incomplete
alter table public.operators add column if not exists subscription_status    text;

create index if not exists operators_stripe_customer_idx on public.operators (stripe_customer_id);
