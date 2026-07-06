-- Per-operator public storefront handle. Each operator's storefront lives at
-- /s/<slug> so their customers see THEIR catalog (not the default operator).

alter table public.operators add column if not exists slug text;

-- Backfill the primary demo operator.
update public.operators set slug = 'bounce-usa' where name = 'Bounce USA' and slug is null;

-- Unique per non-null slug (existing demo rows may stay null until they get one).
create unique index if not exists operators_slug_key on public.operators (slug) where slug is not null;
