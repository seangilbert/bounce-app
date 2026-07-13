import { createAdminClient } from "@/utils/supabase/admin";

/**
 * Read model for the renter's self-service portal (`/my`).
 *
 * Two rules govern everything in this file:
 *
 * 1. ALWAYS scope by account. Every read starts from the caller's verified
 *    `customer_accounts.id`, resolves the `customers` rows that account has
 *    CLAIMED, and filters bookings to those customer ids. `getBooking(id)` in
 *    bookings/repo is an unscoped lookup-by-UUID — using it here would let
 *    anyone with a booking id read anyone's booking.
 *
 * 2. NEVER leak operator-private data. `customers.notes` is the operator's own
 *    CRM notes about this person; it must not appear in any type here.
 */

/** A booking as the renter sees it — with the operator's public identity. */
export interface PortalBooking {
  id: string;
  operatorName: string;
  operatorSlug: string;
  operatorPhone: string | null;
  status: string;
  startDate: string;
  endDate: string;
  deliveryAddress: string | null;
  deliveryWindow: string | null;
  items: { name: string; quantity: number }[];
  total: number;
  /** Net of refunds — what they've actually paid. */
  paidCents: number;
  balanceCents: number;
  payments: PortalPayment[];
  /** null when no agreement was ever sent for this booking. */
  contractStatus: string | null;
}

export interface PortalPayment {
  /** deposit | balance | full | payment */
  type: string;
  amountCents: number;
  /** paid | refunded | pending | failed */
  status: string;
  date: string;
  /** "cash" for operator-recorded payments; undefined for card. */
  method?: string;
}

/** Statuses where the booking is real money owed — a live commitment. */
const COMMITTED = ["paid", "contracted", "confirmed", "delivered", "completed"];

/** The `customers` row ids this account owns, across every operator. */
async function ownedCustomerIds(accountId: string): Promise<string[]> {
  const { data } = await createAdminClient()
    .from("customers")
    .select("id")
    .eq("account_id", accountId);
  return (data ?? []).map((r) => (r as { id: string }).id);
}

interface BookingRow {
  id: string;
  status: string;
  start_date: string;
  end_date: string;
  delivery_address: string | null;
  delivery_window: string | null;
  subtotal: number;
  total: number | null;
  operators: { name: string; slug: string; phone: string | null } | null;
  booking_items: { quantity: number; item: { name: string } | null }[] | null;
}

interface OrderRow {
  booking_id: string;
  amount_total: number;
  status: string;
  created_at: string;
  metadata: { payment_type?: string; method?: string } | null;
  esign_status: string | null;
}

/**
 * Every booking belonging to this account, across all operators, newest event
 * first. Returns [] for an account that has claimed nothing.
 */
export async function listAccountBookings(accountId: string): Promise<PortalBooking[]> {
  const customerIds = await ownedCustomerIds(accountId);
  if (!customerIds.length) return [];

  const { data: rows } = await createAdminClient()
    .from("bookings")
    .select(
      "id, status, start_date, end_date, delivery_address, delivery_window, subtotal, total, " +
        "operators(name, slug, phone), booking_items(quantity, item:items(name))",
    )
    .in("customer_id", customerIds)
    .order("start_date", { ascending: false });

  const bookings = (rows ?? []) as unknown as BookingRow[];
  if (!bookings.length) return [];

  const payments = await paymentsByBooking(bookings.map((b) => b.id));
  return bookings.map((b) => toPortalBooking(b, payments.get(b.id) ?? emptyPayments()));
}

/**
 * A single booking — but ONLY if this account owns it. Returns null otherwise,
 * which the route renders as a 404: an account probing for someone else's
 * booking id must not be able to tell "exists but not yours" from "no such
 * booking".
 */
export async function getAccountBooking(
  accountId: string,
  bookingId: string,
): Promise<PortalBooking | null> {
  const customerIds = await ownedCustomerIds(accountId);
  if (!customerIds.length) return null;

  const { data: row } = await createAdminClient()
    .from("bookings")
    .select(
      "id, status, start_date, end_date, delivery_address, delivery_window, subtotal, total, " +
        "operators(name, slug, phone), booking_items(quantity, item:items(name))",
    )
    .eq("id", bookingId)
    // The ownership check. Without this the id alone would be enough.
    .in("customer_id", customerIds)
    .maybeSingle();

  if (!row) return null;
  const booking = row as unknown as BookingRow;
  const payments = await paymentsByBooking([booking.id]);
  return toPortalBooking(booking, payments.get(booking.id) ?? emptyPayments());
}

interface BookingPayments {
  payments: PortalPayment[];
  contractStatus: string | null;
}

const emptyPayments = (): BookingPayments => ({ payments: [], contractStatus: null });

/**
 * Payment history + contract status, read from `orders`.
 *
 * `orders` has no "kind" column — deposit/balance/full lives in
 * `metadata.payment_type`, and a REFUND is not a new row but the original order
 * flipped to status 'refunded'. So net-paid must exclude refunded orders rather
 * than sum a signed amount. (getOrderByBookingId is no use here: it hides cash
 * orders and returns only the newest.)
 */
async function paymentsByBooking(bookingIds: string[]): Promise<Map<string, BookingPayments>> {
  const out = new Map<string, BookingPayments>();
  if (!bookingIds.length) return out;

  const { data } = await createAdminClient()
    .from("orders")
    .select("booking_id, amount_total, status, created_at, metadata, esign_status")
    .in("booking_id", bookingIds)
    .order("created_at", { ascending: true });

  for (const o of (data ?? []) as unknown as OrderRow[]) {
    const entry = out.get(o.booking_id) ?? emptyPayments();
    entry.payments.push({
      type: o.metadata?.payment_type ?? "payment",
      amountCents: o.amount_total,
      status: o.status,
      date: o.created_at,
      method: o.metadata?.method,
    });
    // Last non-null esign status wins (orders are ascending by date).
    if (o.esign_status) entry.contractStatus = o.esign_status;
    out.set(o.booking_id, entry);
  }
  return out;
}

function toPortalBooking(row: BookingRow, pay: BookingPayments): PortalBooking {
  const total = row.total ?? row.subtotal; // `total` is nullable in the schema.
  const paidCents = pay.payments
    .filter((p) => p.status === "paid")
    .reduce((sum, p) => sum + p.amountCents, 0);
  const committed = COMMITTED.includes(row.status);
  return {
    id: row.id,
    operatorName: row.operators?.name ?? "Operator",
    operatorSlug: row.operators?.slug ?? "",
    operatorPhone: row.operators?.phone ?? null,
    status: row.status,
    startDate: row.start_date,
    endDate: row.end_date,
    deliveryAddress: row.delivery_address,
    deliveryWindow: row.delivery_window,
    items: (row.booking_items ?? []).map((li) => ({
      name: li.item?.name ?? "Item",
      quantity: li.quantity,
    })),
    total,
    paidCents,
    // Only a committed booking owes money. A quote or a canceled booking has no
    // balance due, however much of the total is unpaid.
    balanceCents: committed ? Math.max(0, total - paidCents) : 0,
    payments: pay.payments,
    contractStatus: pay.contractStatus,
  };
}

/** Upcoming = a committed booking whose rental hasn't ended yet. */
export function isUpcoming(b: PortalBooking, today: string): boolean {
  return COMMITTED.includes(b.status) && b.endDate >= today;
}
