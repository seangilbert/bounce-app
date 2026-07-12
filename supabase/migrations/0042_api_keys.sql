-- Per-operator API keys — the foundation for third-party integration (the
-- embeddable widget + a future headless REST API). Two key types:
--   * publishable (pk_) — browser-safe, origin-restricted, low-privilege
--   * secret (sk_)       — server-to-server, higher-privilege
-- We store only a SHA-256 hash of the full key (never the key itself); the plain
-- key is shown to the operator exactly once at creation.
create table if not exists public.api_keys (
  id uuid primary key default gen_random_uuid(),
  operator_id uuid not null references public.operators(id) on delete cascade,
  type text not null check (type in ('publishable', 'secret')),
  name text,                                       -- operator-facing label
  prefix text not null,                            -- e.g. "pk_live" (shown in UI)
  last4 text,                                       -- display: pk_live_••••abcd
  key_hash text not null,                          -- sha256(full key)
  allowed_origins text[] not null default '{}',    -- CORS allowlist (publishable)
  test_mode boolean not null default false,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);

create unique index if not exists api_keys_hash_idx on public.api_keys(key_hash);
create index if not exists api_keys_operator_idx on public.api_keys(operator_id) where revoked_at is null;
