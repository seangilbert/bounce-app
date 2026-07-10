-- Public bucket for operator logos. Operators upload via a server route
-- (service role, which bypasses storage RLS); customers read the public URL on
-- the storefront. Files are stored under `{operatorId}/logo-{uuid}.{ext}`.
-- The logo URL itself is stored on operators.logo_url (already exists).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'operator-logos',
  'operator-logos',
  true,
  2097152, -- 2 MB
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
