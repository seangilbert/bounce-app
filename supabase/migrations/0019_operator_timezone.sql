-- Per-operator timezone so "today" (calendar default month + today marker,
-- deliveries route default day, dashboard today/week) is computed in the
-- operator's local zone instead of the server's UTC. Defaults to US Eastern.
alter table public.operators add column if not exists timezone text not null default 'America/New_York';
