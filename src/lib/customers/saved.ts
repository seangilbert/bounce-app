import { createAdminClient } from "@/utils/supabase/admin";

/**
 * The renter's wishlist (migration 0047).
 *
 * Saves belong to the ACCOUNT, not to an operator — one wishlist across every
 * storefront. A given storefront then shows only the saves whose item belongs
 * to it, which falls out of the item's own operator_id rather than being stored
 * twice (see the migration).
 */

/** Item ids this account has saved, restricted to one operator's catalog. */
export async function listSavedItemIds(accountId: string, operatorId: string): Promise<string[]> {
  const { data } = await createAdminClient()
    .from("saved_items")
    .select("item_id, items!inner(operator_id)")
    .eq("account_id", accountId)
    .eq("items.operator_id", operatorId);
  return (data ?? []).map((r) => (r as { item_id: string }).item_id);
}

/**
 * Toggle a save. Returns the new state, so the caller doesn't have to guess.
 *
 * The item is checked against the operator the caller claims — otherwise a
 * crafted request could save an item from an operator whose storefront this
 * account has never visited. Cheap, and it keeps the wishlist honest.
 */
export async function toggleSavedItem(
  accountId: string,
  itemId: string,
  operatorId: string,
): Promise<{ ok: true; saved: boolean } | { ok: false }> {
  const supabase = createAdminClient();

  const { data: item } = await supabase
    .from("items")
    .select("id")
    .eq("id", itemId)
    .eq("operator_id", operatorId)
    .maybeSingle();
  if (!item) return { ok: false };

  const { data: existing } = await supabase
    .from("saved_items")
    .select("id")
    .eq("account_id", accountId)
    .eq("item_id", itemId)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase.from("saved_items").delete().eq("id", (existing as { id: string }).id);
    return error ? { ok: false } : { ok: true, saved: false };
  }

  const { error } = await supabase.from("saved_items").insert({ account_id: accountId, item_id: itemId });
  // A double-tap can race itself; the unique constraint means "already saved",
  // which is the state the caller wanted anyway.
  if (error && (error as { code?: string }).code !== "23505") return { ok: false };
  return { ok: true, saved: true };
}
