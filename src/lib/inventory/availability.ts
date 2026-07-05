import { createAdminClient } from "@/utils/supabase/admin";
import { listItems } from "./repo";
import type { Item } from "./types";

export interface Availability {
  /** Units the operator owns. */
  owned: number;
  /** Units held by committed bookings on the date. */
  reserved: number;
  /** owned − reserved (can be 0; never assume it's positive). */
  available: number;
}

export interface ItemAvailability extends Item {
  availability: Availability;
}

/** Date must be an ISO `YYYY-MM-DD` string (day-level availability). */
export async function checkAvailability(
  itemId: string,
  date: string,
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

  const { data: reserved, error: rpcErr } = await supabase.rpc("reserved_qty", {
    p_item: itemId,
    p_date: date,
  });
  if (rpcErr) throw new Error(`checkAvailability failed: ${rpcErr.message}`);

  const owned = item.quantity as number;
  const res = (reserved as number) ?? 0;
  const available = owned - res;
  return { owned, reserved: res, available, ok: available >= quantityNeeded };
}

/** The operator's active catalog, each item annotated with availability on `date`. */
export async function availabilityForOperator(
  operatorId: string,
  date: string,
): Promise<ItemAvailability[]> {
  const supabase = createAdminClient();
  const items = await listItems(operatorId, { activeOnly: true });

  const { data: rows, error } = await supabase.rpc("item_availability", {
    p_operator: operatorId,
    p_date: date,
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
