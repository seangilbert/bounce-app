import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";

/**
 * Read model for the renter's self-service portal (`/my`).
 *
 * Isolation is DATABASE-ENFORCED here (RLS Phase 1, migration 0049). The owned
 * reads — bookings / orders / booking_items — go through the USER-SCOPED client
 * (`createClient`, which carries the renter's JWT), and RLS policies keyed to
 * `auth.uid()` guarantee a renter only ever sees their own rows. There is no
 * `account_id` filter in app code anymore because there doesn't need to be:
 * even a raw `select * from bookings` returns only the caller's, and a foreign
 * booking id returns nothing (verified against the live DB).
 *
 * Two things stay on the service role, deliberately:
 * 1. The public operator identity (name/slug/phone) and item names — public
 *    catalog data, fetched for ids that came from the renter's OWN (RLS-scoped)
 *    bookings. Kept off RLS so we never grant the renter read access to
 *    `operators`/`items` (row-level RLS would expose their private columns, e.g.
 *    `operators.stripe_account_id`).
 * 2. `customers` is never read here at all — the RLS helper `auth_customer_ids()`
 *    (SECURITY DEFINER) resolves ownership inside the DB, so `customers.notes`
 *    (operator-private) can't leak.
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
  operator_id: string;
  booking_items: { quantity: number; item_id: string }[] | null;
  orders: OrderRow[] | null;
}

interface OrderRow {
  amount_total: number;
  status: string;
  created_at: string;
  metadata: { payment_type?: string; method?: string } | null;
  esign_status: string | null;
}

/** Owned data only — RLS scopes rows to the caller. No `operators`/`items`/
 *  `customers` joins (those carry private columns); their public bits are
 *  fetched separately via the service role and merged. `orders` + `booking_items`
 *  are embedded (also RLS-scoped to the caller's bookings), one row per booking. */
const BOOKING_SELECT =
  "id, status, start_date, end_date, delivery_address, delivery_window, subtotal, total, operator_id, " +
  "orders(amount_total, status, created_at, metadata, esign_status), " +
  "booking_items(quantity, item_id)";

/** Public operator identity + item names for a set of bookings — service role
 *  (public catalog data), keyed by ids that already came from RLS-scoped rows. */
interface RefData {
  operators: Map<string, { name: string; slug: string; phone: string | null }>;
  items: Map<string, string>;
}
async function loadRefData(rows: BookingRow[]): Promise<RefData> {
  const operatorIds = [...new Set(rows.map((r) => r.operator_id).filter(Boolean))];
  const itemIds = [...new Set(rows.flatMap((r) => (r.booking_items ?? []).map((b) => b.item_id)))];
  const admin = createAdminClient();
  const [{ data: ops }, { data: items }] = await Promise.all([
    operatorIds.length
      ? admin.from("operators").select("id, name, slug, phone").in("id", operatorIds)
      : Promise.resolve({ data: [] }),
    itemIds.length
      ? admin.from("items").select("id, name").in("id", itemIds)
      : Promise.resolve({ data: [] }),
  ]);
  return {
    operators: new Map((ops ?? []).map((o: Record<string, unknown>) => [o.id as string, { name: o.name as string, slug: o.slug as string, phone: (o.phone as string) ?? null }])),
    items: new Map((items ?? []).map((i: Record<string, unknown>) => [i.id as string, i.name as string])),
  };
}

/**
 * Every booking belonging to the signed-in renter, newest event first. RLS
 * scopes it — no `accountId` argument needed. Returns [] for a renter who owns
 * nothing (or a non-renter session).
 */
export async function listAccountBookings(): Promise<PortalBooking[]> {
  const { data } = await createClient()
    .from("bookings")
    .select(BOOKING_SELECT)
    .order("start_date", { ascending: false });

  const rows = (data ?? []) as unknown as BookingRow[];
  if (!rows.length) return [];
  const ref = await loadRefData(rows);
  return rows.map((r) => toPortalBooking(r, ref));
}

/**
 * A single booking — but ONLY if the signed-in renter owns it. RLS returns
 * nothing otherwise, which the route renders as a 404: probing for someone
 * else's booking id must not be distinguishable from "no such booking".
 */
export async function getAccountBooking(bookingId: string): Promise<PortalBooking | null> {
  const { data } = await createClient()
    .from("bookings")
    .select(BOOKING_SELECT)
    .eq("id", bookingId)
    .maybeSingle();

  if (!data) return null;
  const row = data as unknown as BookingRow;
  const ref = await loadRefData([row]);
  return toPortalBooking(row, ref);
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

function toPortalBooking(row: BookingRow, ref: RefData): PortalBooking {
  const pay = readOrders(row.orders ?? []);
  const total = row.total ?? row.subtotal; // `total` is nullable in the schema.
  const paidCents = pay.payments
    .filter((p) => p.status === "paid")
    .reduce((sum, p) => sum + p.amountCents, 0);
  const committed = COMMITTED.includes(row.status);
  const op = ref.operators.get(row.operator_id);
  return {
    id: row.id,
    operatorName: op?.name ?? "Operator",
    operatorSlug: op?.slug ?? "",
    operatorPhone: op?.phone ?? null,
    status: row.status,
    startDate: row.start_date,
    endDate: row.end_date,
    deliveryAddress: row.delivery_address,
    deliveryWindow: row.delivery_window,
    items: (row.booking_items ?? []).map((li) => ({
      name: ref.items.get(li.item_id) ?? "Item",
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
