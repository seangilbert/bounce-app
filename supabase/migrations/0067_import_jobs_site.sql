-- Website-URL imports: a job may now start from the operator's public site
-- (crawl phase), a spreadsheet (extract phase), or both (crawl -> extract ->
-- enrich). CSV becomes optional; crawl progress persists on the row so each
-- server-action step stays bounded.
alter table public.import_jobs
  alter column source_csv drop not null;

alter table public.import_jobs
  add column source_url text,
  add column phase text not null default 'extract'
    check (phase in ('crawl', 'extract', 'enrich')),
  -- {queue: [{url, depth}], seen: string[], pages: [{url, title, images, text}]}
  add column crawl_state jsonb not null default '{}'::jsonb;

alter table public.import_jobs
  add constraint import_jobs_has_source check (source_csv is not null or source_url is not null);
