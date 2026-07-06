-- Auth ↔ tenant mapping. A logged-in user (auth.users) belongs to one or more
-- operators; this is how the operator app resolves "the current operator" from
-- the session instead of the hardcoded single operator.
--
-- Server code reads through the service-role admin client (bypasses RLS); the
-- policy below is defense-in-depth for any future client-side reads.

create table if not exists public.operator_members (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  operator_id uuid not null references public.operators(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  role        text not null default 'owner' check (role in ('owner', 'staff')),
  unique (operator_id, user_id)
);
create index if not exists operator_members_user_idx on public.operator_members (user_id);

alter table public.operator_members enable row level security;

-- A user may read their own membership rows.
drop policy if exists "members read own" on public.operator_members;
create policy "members read own" on public.operator_members
  for select using (auth.uid() = user_id);
