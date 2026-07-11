-- Durable per-operator AI-quote counter (enforces the Free plan's 20/mo cap).
-- Keyed by (operator_id, calendar month) so it "resets" at the month boundary
-- with no cron — a new month is simply a new key. Only AI-assisted quote
-- conversations increment this; manual bookings + storefront browsing don't.
create table if not exists public.operator_ai_usage (
  operator_id uuid not null references public.operators(id) on delete cascade,
  month text not null,               -- 'YYYY-MM' (UTC calendar month)
  count integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (operator_id, month)
);

-- Atomically bump the current month's counter and return the new total. The
-- upsert makes concurrent quote requests serialize on the row, so the count is
-- exact even under load.
create or replace function public.increment_ai_usage(p_operator_id uuid, p_month text)
returns integer
language plpgsql
as $$
declare
  v_count integer;
begin
  insert into public.operator_ai_usage (operator_id, month, count, updated_at)
  values (p_operator_id, p_month, 1, now())
  on conflict (operator_id, month)
  do update set count = public.operator_ai_usage.count + 1, updated_at = now()
  returning count into v_count;
  return v_count;
end;
$$;
