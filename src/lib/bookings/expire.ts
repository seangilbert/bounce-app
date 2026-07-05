import { createAdminClient } from "@/utils/supabase/admin";
import { CHECKOUT_HOLD_MINUTES } from "@/lib/checkout-hold";

/**
 * Release abandoned checkouts: cancel any booking stuck in `pending_payment`
 * past the hold window, so it stops reserving inventory and drops off the
 * operator calendar. Idempotent and cheap (usually affects 0 rows). Call this
 * before reading availability or operator views.
 *
 * A late payment still recovers the booking — the paid webhook flips it to
 * `paid` regardless of the intervening cancel, and the existing oversell guard
 * catches any conflict. The aligned Stripe session expiry makes that rare.
 *
 * Kept out of bookings/repo.ts to avoid an import cycle with inventory
 * (repo → availability → here).
 */
export async function expireStaleCheckouts(): Promise<number> {
  const supabase = createAdminClient();
  const cutoff = new Date(Date.now() - CHECKOUT_HOLD_MINUTES * 60_000).toISOString();
  const { data, error } = await supabase
    .from("bookings")
    .update({ status: "canceled" })
    .eq("status", "pending_payment")
    .lt("updated_at", cutoff)
    .select("id");
  if (error) throw new Error(`expireStaleCheckouts failed: ${error.message}`);
  return data?.length ?? 0;
}
