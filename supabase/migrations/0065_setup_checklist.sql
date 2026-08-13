-- Operator onboarding v2 — the "Get set up" activation checklist.
--
-- Every step's completion is DERIVED from data we already store (items, docs,
-- inquiries, policy/branding columns, agent toggles), so the checklist needs no
-- progress table. The one thing that isn't derivable is the operator saying
-- "stop showing me this" — that's this column. Null = still showing.
alter table public.operators
  add column if not exists setup_dismissed_at timestamptz;
