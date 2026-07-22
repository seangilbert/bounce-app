import { createAdminClient } from "@/utils/supabase/admin";
import { listItems } from "./repo";
import { expireStaleCheckouts } from "@/lib/bookings/expire";
import { bookableUnits, type Item } from "./types";

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
    .select("quantity, units_needs_cleaning, units_damaged, units_in_repair")
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

  // Ready units = owned minus anything out of service.
  const owned = Math.max(
    0,
    (item.quantity as number) -
      (item.units_needs_cleaning ?? 0) -
      (item.units_damaged ?? 0) -
      (item.units_in_repair ?? 0),
  );
  const reserved = (peak as number) ?? 0;
  const available = owned - reserved;
  return { owned, reserved, available, ok: available >= quantityNeeded };
}

/** Statuses that hold inventory (mirrors the SQL in migration 0004/0005). A mere
 *  inquiry/quote does NOT hold a unit. */
const RESERVED_STATUSES = ["pending_payment", "paid", "contracted", "confirmed", "delivered"];

/** One committed booking currently or soon holding units of an item. */
export interface ItemHold {
  bookingId: string;
  customerName: string | null;
  startDate: string;
  endDate: string;
  status: string;
  quantity: number;
}

/**
 * Committed bookings that hold this item on or after `fromDate` (in-progress +
 * upcoming), soonest first. Operator-scoped. Powers the "bookings currently
 * holding this unit" panel on the operator inventory detail page.
 */
export async function listItemHolds(
  operatorId: string,
  itemId: string,
  fromDate: string,
): Promise<ItemHold[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("booking_items")
    .select("quantity, bookings!inner(id, operator_id, customer_name, start_date, end_date, status)")
    .eq("item_id", itemId)
    .eq("bookings.operator_id", operatorId)
    .gte("bookings.end_date", fromDate)
    .in("bookings.status", RESERVED_STATUSES);
  if (error) throw new Error(`listItemHolds failed: ${error.message}`);

  type Row = {
    quantity: number;
    bookings: {
      id: string;
      customer_name: string | null;
      start_date: string;
      end_date: string;
      status: string;
    };
  };
  return ((data as unknown as Row[]) ?? [])
    .map((r) => ({
      bookingId: r.bookings.id,
      customerName: r.bookings.customer_name,
      startDate: r.bookings.start_date,
      endDate: r.bookings.end_date,
      status: r.bookings.status,
      quantity: r.quantity,
    }))
    .sort((a, b) => a.startDate.localeCompare(b.startDate));
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
    // "owned" for booking purposes = ready units (out-of-service held back).
    const owned = bookableUnits(item);
    return {
      ...item,
      availability: { owned, reserved, available: owned - reserved },
    };
  });
}
