import { createAdminClient } from "@/utils/supabase/admin";
import { checkAvailability } from "@/lib/inventory/availability";
import { durationDays, lineTotal, priceBreakdown } from "@/lib/inventory/pricing";
import type { PriceUnit } from "@/lib/inventory/types";
import type { Booking, BookingLineItem, BookingStatus, NewBooking } from "./types";

const BOOKINGS = "bookings";
const BOOKING_ITEMS = "booking_items";

interface BookingRow {
  id: string;
  created_at: string;
  updated_at: string;
  operator_id: string;
  status: BookingStatus;
  start_date: string;
  end_date: string;
  customer_name: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  delivery_window: string | null;
  delivery_address: string | null;
  delivery_zip: string | null;
  subtotal: number;
  delivery_fee: number | null;
  tax_amount: number | null;
  total: number | null;
  deposit: number | null;
  currency: string;
  notes: string | null;
}

interface BookingItemRow {
  item_id: string;
  quantity: number;
  unit_price: number;
  line_total: number;
  items: { name: string } | null;
}

function rowToBooking(row: BookingRow, items: BookingLineItem[]): Booking {
  return {
    id: row.id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    operatorId: row.operator_id,
    status: row.status,
    startDate: row.start_date,
    endDate: row.end_date,
    customerName: row.customer_name,
    customerEmail: row.customer_email,
    customerPhone: row.customer_phone,
    deliveryWindow: row.delivery_window,
    deliveryAddress: row.delivery_address,
    deliveryZip: row.delivery_zip,
    subtotal: row.subtotal,
    deliveryFee: row.delivery_fee ?? 0,
    taxAmount: row.tax_amount ?? 0,
    total: row.total ?? row.subtotal,
    deposit: row.deposit,
    currency: row.currency,
    notes: row.notes,
    items,
  };
}

/** Load a booking with its line items (item name joined in). */
export async function getBooking(id: string): Promise<Booking | null> {
  const supabase = createAdminClient();
  const { data: row, error } = await supabase
    .from(BOOKINGS)
    .select()
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`getBooking failed: ${error.message}`);
  if (!row) return null;

  const { data: itemRows, error: itemsErr } = await supabase
    .from(BOOKING_ITEMS)
    .select("item_id, quantity, unit_price, line_total, items(name)")
    .eq("booking_id", id);
  if (itemsErr) throw new Error(`getBooking items failed: ${itemsErr.message}`);

  const items: BookingLineItem[] = (itemRows as unknown as BookingItemRow[]).map((r) => ({
    itemId: r.item_id,
    name: r.items?.name ?? "(item)",
    quantity: r.quantity,
    unitPrice: r.unit_price,
    lineTotal: r.line_total,
  }));
  return rowToBooking(row as BookingRow, items);
}

/**
 * Create a `quoted` booking, snapshotting each item's current price into
 * booking_items and computing the subtotal. Validates every selected item
 * exists, belongs to the operator, and is active. Does NOT reserve inventory
 * (a quote holds nothing) — availability is enforced by the caller.
 */
export async function createBooking(input: NewBooking): Promise<Booking> {
  const supabase = createAdminClient();
  if (!input.items.length) throw new Error("A booking needs at least one item.");

  const days = durationDays(input.startDate, input.endDate);
  const ids = input.items.map((i) => i.itemId);
  const { data: itemRows, error: itemsErr } = await supabase
    .from("items")
    .select("id, name, base_price, price_unit, operator_id, active")
    .in("id", ids);
  if (itemsErr) throw new Error(`createBooking item lookup failed: ${itemsErr.message}`);

  const byId = new Map((itemRows ?? []).map((r) => [r.id as string, r]));
  const lines = input.items.map((sel) => {
    const it = byId.get(sel.itemId);
    if (!it) throw new Error(`Item ${sel.itemId} not found.`);
    if (it.operator_id !== input.operatorId) {
      throw new Error(`Item ${sel.itemId} does not belong to this operator.`);
    }
    if (!it.active) throw new Error(`Item "${it.name}" is not available.`);
    if (!Number.isInteger(sel.quantity) || sel.quantity <= 0) {
      throw new Error(`Invalid quantity for "${it.name}".`);
    }
    const unitPrice = it.base_price as number;
    return {
      item_id: sel.itemId,
      quantity: sel.quantity,
      // Snapshot the per-unit rate; line_total applies the rental duration.
      unit_price: unitPrice,
      line_total: lineTotal(unitPrice, it.price_unit as PriceUnit, sel.quantity, days),
    };
  });
  const subtotal = lines.reduce((sum, l) => sum + l.line_total, 0);

  // Snapshot the operator's tax + delivery fee into the booking total.
  const { data: op } = await supabase
    .from("operators")
    .select("tax_percent, delivery_fee_cents")
    .eq("id", input.operatorId)
    .single();
  const bd = priceBreakdown(subtotal, op?.delivery_fee_cents ?? 0, Number(op?.tax_percent ?? 0));

  const { data: booking, error: bErr } = await supabase
    .from(BOOKINGS)
    .insert({
      operator_id: input.operatorId,
      status: "quoted",
      start_date: input.startDate,
      end_date: input.endDate,
      customer_name: input.customerName ?? null,
      customer_email: input.customerEmail ?? null,
      customer_phone: input.customerPhone ?? null,
      delivery_window: input.deliveryWindow ?? null,
      delivery_address: input.deliveryAddress ?? null,
      delivery_zip: input.deliveryZip ?? null,
      notes: input.notes ?? null,
      subtotal,
      delivery_fee: bd.deliveryFee,
      tax_amount: bd.tax,
      total: bd.total,
      currency: "usd",
    })
    .select("id")
    .single();
  if (bErr) throw new Error(`createBooking failed: ${bErr.message}`);

  const { error: biErr } = await supabase
    .from(BOOKING_ITEMS)
    .insert(lines.map((l) => ({ booking_id: booking.id, ...l })));
  if (biErr) throw new Error(`createBooking items failed: ${biErr.message}`);

  const created = await getBooking(booking.id);
  if (!created) throw new Error("createBooking: booking vanished after insert.");
  return created;
}

/** Transition a booking's status. Returns the updated booking. */
export async function setBookingStatus(
  id: string,
  status: BookingStatus,
): Promise<Booking | null> {
  const supabase = createAdminClient();
  const { error } = await supabase.from(BOOKINGS).update({ status }).eq("id", id);
  if (error) throw new Error(`setBookingStatus failed: ${error.message}`);
  return getBooking(id);
}

/**
 * Record the amount collected up front (minor units). For a deposit this is the
 * partial payment; for pay-in-full it equals the subtotal. The balance shown to
 * the operator is subtotal − deposit.
 */
export async function setBookingDeposit(id: string, deposit: number): Promise<void> {
  const supabase = createAdminClient();
  const { error } = await supabase.from(BOOKINGS).update({ deposit }).eq("id", id);
  if (error) throw new Error(`setBookingDeposit failed: ${error.message}`);
}

/**
 * Mark a booking paid and run the final oversell guard. The payment already
 * succeeded, so we never block here — we set `paid` and RETURN any items whose
 * total committed reservations now exceed units owned, for the caller to alert
 * on. (This booking is itself counted, since paid/pending_payment reserve.)
 */
export async function confirmBookingPaid(
  bookingId: string,
): Promise<{ booking: Booking | null; oversold: { itemId: string; owned: number; reserved: number }[] }> {
  const booking = await getBooking(bookingId);
  if (!booking) return { booking: null, oversold: [] };

  await setBookingStatus(bookingId, "paid");

  const oversold: { itemId: string; owned: number; reserved: number }[] = [];
  for (const li of booking.items) {
    const a = await checkAvailability(li.itemId, booking.startDate, booking.endDate, 0);
    if (a.reserved > a.owned) {
      oversold.push({ itemId: li.itemId, owned: a.owned, reserved: a.reserved });
    }
  }
  return { booking: await getBooking(bookingId), oversold };
}
