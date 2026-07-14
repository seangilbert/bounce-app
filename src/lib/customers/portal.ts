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
  orders: OrderRow[] | null;
}

interface OrderRow {
  amount_total: number;
  status: string;
  created_at: string;
  metadata: { payment_type?: string; method?: string } | null;
  esign_status: string | null;
}

/**
 * One round-trip, and the ownership check is baked into it.
 *
 * `customers!inner(account_id)` + the matching filter is the security control:
 * a booking is only visible if it hangs off a `customers` row this account owns.
 * Filtering through the join (rather than pre-fetching the ids and passing them
 * to `.in()`) is what lets this be a single query — and every Supabase call
 * crosses a region boundary (~120ms), so query DEPTH is what the page's latency
 * is made of. Embedding `orders` the same way removes a second hop.
 *
 * `booking_items` and `orders` are embedded, not joined-and-flattened, so a
 * booking with three line items is still one row.
 */
const BOOKING_SELECT =
  "id, status, start_date, end_date, delivery_address, delivery_window, subtotal, total, " +
  "customers!inner(account_id), operators(name, slug, phone), " +
  "booking_items(quantity, item:items(name)), " +
  "orders(amount_total, status, created_at, metadata, esign_status)";

/**
 * Every booking belonging to this account, across all operators, newest event
 * first. Returns [] for an account that has claimed nothing.
 */
export async function listAccountBookings(accountId: string): Promise<PortalBooking[]> {
  const { data } = await createAdminClient()
    .from("bookings")
    .select(BOOKING_SELECT)
    .eq("customers.account_id", accountId)
    .order("start_date", { ascending: false });

  return ((data ?? []) as unknown as BookingRow[]).map(toPortalBooking);
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
  const { data } = await createAdminClient()
    .from("bookings")
    .select(BOOKING_SELECT)
    .eq("id", bookingId)
    // The ownership check. Without it, the booking id alone would be enough.
    .eq("customers.account_id", accountId)
    .maybeSingle();

  return data ? toPortalBooking(data as unknown as BookingRow) : null;
}

/**
 * Payment history + contract status, from the booking's embedded `orders`.
 *
 * `orders` has no "kind" column — deposit/balance/full lives in
 * `metadata.payment_type`, and a REFUND is not a new row but the original order
 * flipped to status 'refunded'. So net-paid must EXCLUDE refunded orders rather
 * than sum a signed amount. (`getOrderByBookingId` is no use here: it hides cash
 * orders and returns only the newest.)
 *
 * Embedded rows come back unordered, so sort before reading "the last esign
 * status" off them.
 */
function readOrders(rows: OrderRow[]): { payments: PortalPayment[]; contractStatus: string | null } {
  const sorted = [...rows].sort((a, b) => (a.created_at < b.created_at ? -1 : 1));
  let contractStatus: string | null = null;
  const payments = sorted.map((o) => {
    // Latest non-null wins.
    if (o.esign_status) contractStatus = o.esign_status;
    return {
      type: o.metadata?.payment_type ?? "payment",
      amountCents: o.amount_total,
      status: o.status,
      date: o.created_at,
      method: o.metadata?.method,
    };
  });
  return { payments, contractStatus };
}

function toPortalBooking(row: BookingRow): PortalBooking {
  const pay = readOrders(row.orders ?? []);
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
