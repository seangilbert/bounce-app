import { createAdminClient } from "@/utils/supabase/admin";
import { listItems } from "./repo";
import { expireStaleCheckouts } from "@/lib/bookings/expire";
import type { Item } from "./types";

export interface Availability {
  /** Units the operator owns. */
  owned: number;
  /** Peak units held by committed bookings on the busiest day of the range. */
  reserved: number;
  /** owned − reserved (can be 0 or negative; never assume positive). */
  available: number;
}

export interface ItemAvailability extends Item {
  availability: Availability;
}

/**
 * Availability of one item across an inclusive `YYYY-MM-DD` date range.
 * `available = owned − peak daily reservation` over the range.
 */
export async function checkAvailability(
  itemId: string,
  startDate: string,
  endDate: string,
  quantityNeeded = 1,
): Promise<Availability & { ok: boolean }> {
  const supabase = createAdminClient();

  const { data: item, error: itemErr } = await supabase
    .from("items")
    .select("quantity")
    .eq("id", itemId)
    .maybeSingle();
  if (itemErr) throw new Error(`checkAvailability failed: ${itemErr.message}`);
  if (!item) throw new Error(`Item ${itemId} not found.`);

  const { data: peak, error: rpcErr } = await supabase.rpc("reserved_peak", {
    p_item: itemId,
    p_start: startDate,
    p_end: endDate,
  });
  if (rpcErr) throw new Error(`checkAvailability failed: ${rpcErr.message}`);

  const owned = item.quantity as number;
  const reserved = (peak as number) ?? 0;
  const available = owned - reserved;
  return { owned, reserved, available, ok: available >= quantityNeeded };
}

/** The operator's active catalog, each item annotated with availability over the range. */
export async function availabilityForOperator(
  operatorId: string,
  startDate: string,
  endDate: string,
): Promise<ItemAvailability[]> {
  const supabase = createAdminClient();
  // Release abandoned checkouts first so availability reflects only live holds.
  await expireStaleCheckouts();
  const items = await listItems(operatorId, { activeOnly: true });

  const { data: rows, error } = await supabase.rpc("item_availability_range", {
    p_operator: operatorId,
    p_start: startDate,
    p_end: endDate,
  });
  if (error) throw new Error(`availabilityForOperator failed: ${error.message}`);

  const reservedByItem = new Map<string, number>();
  for (const r of (rows as { item_id: string; reserved: number }[]) ?? []) {
    reservedByItem.set(r.item_id, r.reserved);
  }

  return items.map((item) => {
    const reserved = reservedByItem.get(item.id) ?? 0;
    return {
      ...item,
      availability: { owned: item.quantity, reserved, available: item.quantity - reserved },
    };
  });
}
