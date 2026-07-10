import { createAdminClient } from "@/utils/supabase/admin";
import { upsertCustomer } from "@/lib/customers/repo";
import { checkAvailability } from "@/lib/inventory/availability";
import { durationDays, lineTotal, priceBreakdown } from "@/lib/inventory/pricing";
import { resolveOperatorDeliveryFee } from "@/lib/delivery/resolve";
import type { DeliveryMode } from "@/lib/delivery/pricing";
import { assessRange, normalizeSchedule } from "@/lib/availability/schedule";
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
    .select(
      "tax_percent, delivery_fee_cents, delivery_taxable, delivery_mode, delivery_config, latitude, longitude, availability_config",
    )
    .eq("id", input.operatorId)
    .single();

  // Enforce the operator's availability schedule (operating days + blackouts).
  // Operator-created bookings bypass it — they can override their own schedule.
  if (!input.skipAvailabilityCheck) {
    const assessment = assessRange(
      normalizeSchedule(op?.availability_config),
      input.startDate,
      input.endDate,
    );
    if (!assessment.ok) throw new Error(assessment.message ?? "That date isn't available.");
  }

  // Resolve the delivery fee: an explicit override wins; otherwise price by the
  // operator's model (flat / zones / distance). A null resolve (out of area /
  // unknown location) falls back to 0 — the operator can override on the booking.
  let deliveryFeeCents: number;
  if (input.deliveryFeeOverrideCents != null) {
    deliveryFeeCents = Math.max(0, Math.round(input.deliveryFeeOverrideCents));
  } else {
    const quote = await resolveOperatorDeliveryFee(
      {
        mode: (op?.delivery_mode as DeliveryMode) ?? "flat",
        flatCents: op?.delivery_fee_cents ?? 0,
        config: op?.delivery_config,
        lat: op?.latitude ?? null,
        lon: op?.longitude ?? null,
      },
      { zip: input.deliveryZip, address: input.deliveryAddress },
    );
    deliveryFeeCents = quote.feeCents ?? 0;
  }

  const bd = priceBreakdown(
    subtotal,
    deliveryFeeCents,
    Number(op?.tax_percent ?? 0),
    op?.delivery_taxable ?? true,
  );

  // Resolve/create the CRM customer first so the booking carries customer_id
  // (best-effort — a CRM hiccup never blocks a booking).
  let customerId: string | null = null;
  try {
    customerId = await upsertCustomer(input.operatorId, {
      email: input.customerEmail,
      phone: input.customerPhone,
      name: input.customerName,
    });
  } catch (e) {
    console.error("[customers] upsert on booking failed:", e);
  }

  const { data: booking, error: bErr } = await supabase
    .from(BOOKINGS)
    .insert({
      operator_id: input.operatorId,
      customer_id: customerId,
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
      delivery_fee_override_cents: input.deliveryFeeOverrideCents ?? null,
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

export interface OutcomeBookingRow {
  id: string;
  customer_email: string | null;
  start_date: string;
  end_date: string;
  status: string;
  total: number | null;
}

/**
 * Minimal booking rows for resolving inquiry → booking outcomes: the explicitly
 * linked bookings (by id) plus any bookings from the same customers (by email),
 * for the heuristic date-overlap match. Two scoped queries in parallel.
 */
export async function bookingsForOutcomes(
  operatorId: string,
  bookingIds: string[],
  emails: string[],
): Promise<OutcomeBookingRow[]> {
  const supabase = createAdminClient();
  const cols = "id, customer_email, start_date, end_date, status, total";
  const [byId, byEmail] = await Promise.all([
    bookingIds.length
      ? supabase.from(BOOKINGS).select(cols).eq("operator_id", operatorId).in("id", bookingIds)
      : Promise.resolve({ data: [] as OutcomeBookingRow[] }),
    emails.length
      ? supabase.from(BOOKINGS).select(cols).eq("operator_id", operatorId).in("customer_email", emails)
      : Promise.resolve({ data: [] as OutcomeBookingRow[] }),
  ]);
  const merged = new Map<string, OutcomeBookingRow>();
  for (const r of [...((byId.data ?? []) as OutcomeBookingRow[]), ...((byEmail.data ?? []) as OutcomeBookingRow[])]) {
    merged.set(r.id, r);
  }
  return [...merged.values()];
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

/** Persist the loadout checklist (checked required-equipment labels) for a booking. */
export async function setBookingLoadout(id: string, labels: string[]): Promise<void> {
  const supabase = createAdminClient();
  const { error } = await supabase.from(BOOKINGS).update({ loadout: labels }).eq("id", id);
  if (error) throw new Error(`setBookingLoadout failed: ${error.message}`);
}

/**
 * Advance a booking's cleaning turnaround. `needs_cleaning` moves its units into
 * the item needs-cleaning pool (drops them from availability); `clean` frees
 * them again. Atomic + idempotent via the set_booking_turnaround RPC.
 */
export async function setBookingTurnaround(id: string, stage: "needs_cleaning" | "clean"): Promise<void> {
  const supabase = createAdminClient();
  const { error } = await supabase.rpc("set_booking_turnaround", { p_booking_id: id, p_stage: stage });
  if (error) throw new Error(`setBookingTurnaround failed: ${error.message}`);
}

/**
 * Atomically reserve inventory for a quoted booking and move it to
 * `pending_payment` (the reserving state). Locks the booking's items + re-checks
 * capacity in one transaction (see migration 0020), closing the overbooking
 * race. Returns `{ ok: false, soldOut: true }` if capacity ran out.
 */
export async function reserveBooking(
  id: string,
): Promise<{ ok: true } | { ok: false; soldOut: boolean }> {
  const supabase = createAdminClient();
  const { error } = await supabase.rpc("reserve_booking", { p_booking_id: id });
  if (error) {
    if (/OVERSELL/.test(error.message)) return { ok: false, soldOut: true };
    throw new Error(`reserveBooking failed: ${error.message}`);
  }
  return { ok: true };
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
