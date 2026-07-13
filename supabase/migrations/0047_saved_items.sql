-- Storefront "Saved" — a renter's wishlist.
--
-- Until now the Saved view was a hardcoded empty state: there was nowhere to
-- save TO, because there was no customer identity. `customer_accounts` (0046)
-- gives us one, so saves hang off the platform-level account rather than any
-- single operator.
--
-- Note what's NOT here: an operator_id. It's implied by the item (items belong
-- to an operator), so a storefront shows only the saves for ITS items — while
-- the account still owns one coherent wishlist across every operator. Adding an
-- operator_id would let the two disagree.
create table if not exists public.saved_items (
  id         uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.customer_accounts(id) on delete cascade,
  -- Cascade: if an operator deletes an item, it silently leaves every wishlist
  -- rather than dangling as a broken card.
  item_id    uuid not null references public.items(id) on delete cascade,
  created_at timestamptz not null default now(),
  -- Saving is idempotent — the heart is a toggle, not a counter.
  unique (account_id, item_id)
);

create index if not exists saved_items_account_idx on public.saved_items (account_id);
