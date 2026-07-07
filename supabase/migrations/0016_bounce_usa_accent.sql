-- Bring `bounce-usa` onto the demo palette. It carried a leftover custom color
-- (#6d28d9 purple) that predated the palette, so the 0015 round-robin backfill
-- skipped it (only touched null colors). Set it to Pine so it stays visually
-- distinct from demo-1's Midnight Blue. Palette must match lib/branding/palette.ts.
-- The guard keeps this a no-op if it's already an on-palette color.

update public.operators
set brand_color = '#123B33' -- Pine
where slug = 'bounce-usa'
  and brand_color not in ('#13294B', '#123B33', '#4A2E12', '#5A1E1A');
