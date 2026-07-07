-- Assign each existing operator one of the demo accent colors, round-robin by
-- creation order, so multi-tenant storefronts + dashboards look visually
-- distinct. New operators get theirs at signup (see api/auth/signup); operators
-- will be able to customize their own color later.
--
-- The `brand_color` column already exists (0003_inventory); this only backfills
-- rows that don't have one yet. Palette must match lib/branding/palette.ts.

with ordered as (
  select id, (row_number() over (order by created_at, id) - 1) as rn
  from public.operators
  where brand_color is null
),
palette (idx, hex) as (
  values (0, '#13294B'), (1, '#123B33'), (2, '#4A2E12'), (3, '#5A1E1A')
)
update public.operators o
set brand_color = p.hex
from ordered ord
join palette p on p.idx = (ord.rn % 4)
where o.id = ord.id;
