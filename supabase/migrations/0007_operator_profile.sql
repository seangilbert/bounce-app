-- Operator profile fields for the app shell (sidebar identity, dashboard
-- greeting) and location-based weather. Previously these were hardcoded in
-- src/lib/operator/mock.ts.
--
--   owner_name          — the person running the business (sidebar account card)
--   location            — human-readable service area (sidebar + weather detail)
--   plan                — subscription tier: free | solo | growing
--   latitude/longitude  — for the weather forecast (Open-Meteo)

alter table public.operators add column if not exists owner_name text;
alter table public.operators add column if not exists location   text;
alter table public.operators add column if not exists plan       text not null default 'solo';
alter table public.operators add column if not exists latitude   double precision;
alter table public.operators add column if not exists longitude  double precision;

-- Populate the MVP operator (Plymouth, MA coordinates).
update public.operators
  set owner_name = coalesce(owner_name, 'Cheri Boyd'),
      location   = coalesce(location, 'Plymouth, MA'),
      plan       = 'solo',
      latitude   = coalesce(latitude, 41.9584),
      longitude  = coalesce(longitude, -70.6673)
  where name = 'Bounce USA';
