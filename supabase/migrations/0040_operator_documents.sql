-- Operator document management: a private per-operator file library for the
-- business paperwork a rental operation keeps on hand (COI, license, inspection
-- records, W-9, permits, waiver/contract templates). Sensitive, so the bucket is
-- PRIVATE — operators upload via a server route (service role, bypasses storage
-- RLS) and read through short-lived signed URLs; nothing is publicly reachable.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'operator-docs',
  'operator-docs',
  false,
  20971520, -- 20 MB
  array[
    'application/pdf',
    'image/jpeg', 'image/png', 'image/webp', 'image/heic',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  operator_id uuid not null references public.operators(id) on delete cascade,
  -- What kind of document (drives the dashboard expiry warnings + filtering).
  type text not null default 'other'
    check (type in ('coi', 'license', 'inspection', 'w9', 'permit', 'waiver', 'contract', 'other')),
  label text,
  file_path text not null,      -- path within the operator-docs bucket
  file_name text,               -- original upload name (for download)
  mime_type text,
  size_bytes bigint,
  expires_at date,              -- when insurance / license lapses (nullable)
  -- Optional links to a specific record (CRM timeline / proof-of-delivery).
  booking_id uuid references public.bookings(id) on delete set null,
  customer_id uuid references public.customers(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists documents_operator_idx on public.documents(operator_id);
create index if not exists documents_booking_idx on public.documents(booking_id) where booking_id is not null;
create index if not exists documents_customer_idx on public.documents(customer_id) where customer_id is not null;
create index if not exists documents_expiry_idx on public.documents(operator_id, expires_at) where expires_at is not null;
