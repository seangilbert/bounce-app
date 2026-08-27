-- Catalog-import jobs: one row per spreadsheet upload. Extraction runs in
-- chunks (each bounded to a single server-action call), staged items accumulate
-- here for the review table, and commit turns them into real catalog items.
create table public.import_jobs (
  id            uuid primary key default gen_random_uuid(),
  operator_id   uuid not null references public.operators(id) on delete cascade,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  status        text not null default 'processing'
                  check (status in ('processing', 'review', 'committed', 'failed')),
  source_name   text,
  source_csv    text not null,
  total_chunks  integer not null default 0,
  done_chunks   integer not null default 0,
  -- StagedItem[] (see src/lib/import/schema.ts) — model drafts, not items yet.
  staged        jsonb not null default '[]'::jsonb,
  warnings      jsonb not null default '[]'::jsonb,
  error         text
);

create index import_jobs_operator_idx on public.import_jobs (operator_id, created_at desc);

-- Deny-all RLS: all access goes through operator server actions on the
-- service-role client (requireAdmin gates them). Nothing user-scoped reads this.
alter table public.import_jobs enable row level security;

drop trigger if exists import_jobs_set_updated_at on public.import_jobs;
create trigger import_jobs_set_updated_at
  before update on public.import_jobs
  for each row execute function public.set_updated_at();
