import { createAdminClient } from "@/utils/supabase/admin";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const WEEKDAY = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** Bookings that are actually going ahead (paid → completed) — these are the
 *  ones a driver services. Excludes quoted / pending_payment / canceled. */
const ON = ["paid", "contracted", "confirmed", "delivered", "completed"];

export type StopKind = "DELIVER" | "PICKUP";

export interface RouteStop {
  key: string;
  bookingId: string;
  kind: StopKind;
  done: boolean;
  timeWindow: string;
  customer: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  zip: string | null;
  items: string;
}

export interface DeliveryRoute {
  dateIso: string;
  dateLabel: string;
  todayIso: string;
  dropOffs: RouteStop[];
  pickUps: RouteStop[];
}

interface Row {
  id: string;
  status: string;
  start_date: string;
  end_date: string;
  customer_name: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  delivery_window: string | null;
  delivery_address: string | null;
  delivery_zip: string | null;
  booking_items: { quantity: number; items: { name: string } | null }[];
}

function itemsLabel(bookingItems: Row["booking_items"]): string {
  return (bookingItems ?? [])
    .map((li) => {
      const name = (li.items?.name ?? "Item").replace(/ Bounce (House|Castle)$/i, "").replace(/(\d+)×\d+/, "$1");
      return li.quantity > 1 ? `${name} ×${li.quantity}` : name;
    })
    .join(" · ");
}

/** Minutes-into-day of a delivery window's start (for ordering); unknown → end. */
function windowStart(w: string | null): number {
  if (!w) return 24 * 60;
  const m = w.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i);
  if (!m) return 24 * 60;
  let h = parseInt(m[1]!, 10) % 12;
  if (/pm/i.test(m[3]!)) h += 12;
  return h * 60 + (m[2] ? parseInt(m[2]!, 10) : 0);
}

function toStop(r: Row, kind: StopKind): RouteStop {
  const done = kind === "DELIVER" ? ["delivered", "completed"].includes(r.status) : r.status === "completed";
  return {
    key: `${r.id}:${kind}`,
    bookingId: r.id,
    kind,
    done,
    timeWindow: r.delivery_window ?? "—",
    customer: r.customer_name ?? "Customer",
    phone: r.customer_phone,
    email: r.customer_email,
    address: r.delivery_address,
    zip: r.delivery_zip,
    items: itemsLabel(r.booking_items),
  };
}

/**
 * The day's driver route: drop-offs (bookings starting `dateIso`) and pick-ups
 * (bookings ending `dateIso`), each ordered by delivery window. A single-day
 * rental appears in both. "Done" derives from the booking status.
 */
export async function getDeliveryRoute(operatorId: string, dateIso: string): Promise<DeliveryRoute> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("bookings")
    .select(
      "id, status, start_date, end_date, customer_name, customer_email, customer_phone, delivery_window, delivery_address, delivery_zip, booking_items(quantity, items(name))",
    )
    .eq("operator_id", operatorId)
    .in("status", ON)
    .or(`start_date.eq.${dateIso},end_date.eq.${dateIso}`);
  if (error) throw new Error(`getDeliveryRoute failed: ${error.message}`);
  const rows = (data ?? []) as unknown as Row[];

  const byWindow = (a: RouteStop, b: RouteStop) => windowStart(a.timeWindow) - windowStart(b.timeWindow);
  const dropOffs = rows.filter((r) => r.start_date === dateIso).map((r) => toStop(r, "DELIVER")).sort(byWindow);
  const pickUps = rows.filter((r) => r.end_date === dateIso).map((r) => toStop(r, "PICKUP")).sort(byWindow);

  const dt = new Date(`${dateIso}T00:00:00Z`);
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const todayIso = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

  return {
    dateIso,
    dateLabel: `${WEEKDAY[dt.getUTCDay()]}, ${MONTHS[dt.getUTCMonth()]} ${dt.getUTCDate()}`,
    todayIso,
    dropOffs,
    pickUps,
  };
}
