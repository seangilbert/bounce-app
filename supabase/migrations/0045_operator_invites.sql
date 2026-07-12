-- Pending invitations to join an operator's team. An admin invites by email +
-- role; the invitee accepts via a tokened link, which creates their
-- operator_members row. Written only server-side via the service role.
create table if not exists public.operator_invites (
  id          uuid primary key default gen_random_uuid(),
  operator_id uuid not null references public.operators(id) on delete cascade,
  email       text not null,
  role        text not null default 'employee' check (role in ('admin', 'employee')),
  token       text not null unique,
  invited_by  uuid references auth.users(id) on delete set null,
  status      text not null default 'pending' check (status in ('pending', 'accepted', 'revoked')),
  created_at  timestamptz not null default now(),
  accepted_at timestamptz,
  expires_at  timestamptz not null default (now() + interval '7 days')
);

create index if not exists operator_invites_operator_idx
  on public.operator_invites (operator_id) where status = 'pending';
-- One pending invite per email per operator.
create unique index if not exists operator_invites_email_pending_idx
  on public.operator_invites (operator_id, lower(email)) where status = 'pending';

alter table public.operator_invites enable row level security;
