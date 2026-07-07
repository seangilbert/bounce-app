-- Public bucket for inventory item photos. Operators upload via a server route
-- (service role, which bypasses storage RLS); customers read the public URLs on
-- the storefront. Files are stored under `{operatorId}/{uuid}.jpg`.
-- Public read + a size/type guard is all we need — writes go through the app.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'item-photos',
  'item-photos',
  true,
  8388608, -- 8 MB
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
