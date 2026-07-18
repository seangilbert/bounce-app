-- RLS Phase 2 — operator documents (storage-coupled). See docs/rls-plan.md.
--
-- `documents` holds metadata for an operator's private business files (COIs,
-- licenses, rental agreements, per-booking/-customer attachments). The rows are
-- operator-only, so this adds full operator CRUD keyed to auth_operator_ids();
-- the documents-table reads/writes in documents/repo.ts move to the user-scoped
-- client so tenant isolation is DB-enforced.
--
-- STORAGE STAYS SERVICE ROLE. The actual files live in the private
-- `operator-docs` bucket, and every bucket op (signed-URL minting, upload,
-- remove, download) keeps using the admin client — Storage has its own RLS on
-- storage.objects, a separate boundary we are deliberately not touching here. So
-- each repo function is split: the `documents` TABLE query runs user-scoped, the
-- `supabase.storage.*` call runs on the admin client.
--
-- Note: createContractTemplateFromDocument (esign) reads `documents` via the
-- admin client and is left as-is — it bypasses RLS and also downloads from the
-- bucket, so it belongs with the storage paths.

create policy "operator selects own documents" on public.documents
  for select to authenticated
  using (operator_id in (select public.auth_operator_ids()));

create policy "operator inserts own documents" on public.documents
  for insert to authenticated
  with check (operator_id in (select public.auth_operator_ids()));

create policy "operator updates own documents" on public.documents
  for update to authenticated
  using (operator_id in (select public.auth_operator_ids()))
  with check (operator_id in (select public.auth_operator_ids()));

create policy "operator deletes own documents" on public.documents
  for delete to authenticated
  using (operator_id in (select public.auth_operator_ids()));
