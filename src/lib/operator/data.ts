import { createAdminClient } from "@/utils/supabase/admin";
import type {
  CalDay,
  CalEvent,
  CalendarMonth,
  ItemCategory,
  SelectedDayDetail,
} from "./calendar";

/** Booking statuses that occupy inventory (shown on the calendar). */
const COMMITTED = ["pending_payment", "paid", "contracted", "confirmed", "delivered", "completed"];

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const WEEKDAY = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function toCategory(c: string | null): ItemCategory {
  if (c === "tent") return "tent";
  if (c === "tables" || c === "furniture") return "tables";
  return "bounce";
}

/** Compact label for a calendar pill, e.g. "Rainbow 15×15 Bounce Castle" → "Rainbow 15". */
function shortLabel(name: string, qty: number): string {
  let s = name
    .replace(/ Bounce (House|Castle)$/i, "")
    .replace(/(\d+)×\d+/, "$1")
    .replace(/ & chairs/i, "");
  if (qty > 1) s = `${s} ×${qty}`;
  return s;
}

function money(cents: number): string {
  return `$${Math.round(cents / 100).toLocaleString("en-US")}`;
}

const blank = (): CalDay => ({ date: null, events: [], fullyBooked: false, moreCount: 0 });

interface BItem {
  item_id: string;
  quantity: number;
  unit_price: number;
  items: { name: string; category: string | null } | null;
}
interface BRow {
  id: string;
  start_date: string;
  customer_name: string | null;
  status: string;
  delivery_window: string | null;
  subtotal: number;
  deposit: number | null;
  booking_items: BItem[];
}

/**
 * Month view model for the operator calendar, computed from live bookings.
 * "Fully booked" = every bounce-house unit is reserved that day (the constrained
 * inventory), i.e. the same reservation logic the availability engine enforces.
 */
export async function getCalendarMonth(
  operatorId: string,
  year: number,
  month: number,
): Promise<CalendarMonth> {
  const supabase = createAdminClient();
  const pad = (n: number) => String(n).padStart(2, "0");
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const first = `${year}-${pad(month)}-01`;
  const last = `${year}-${pad(month)}-${pad(daysInMonth)}`;

  const { data: items } = await supabase
    .from("items")
    .select("id, category, quantity")
    .eq("operator_id", operatorId);
  const bounceOwned = (items ?? []).filter((i) => toCategory(i.category) === "bounce");

  const { data, error } = await supabase
    .from("bookings")
    .select(
      "id, start_date, customer_name, status, delivery_window, subtotal, deposit, booking_items(item_id, quantity, unit_price, items(name, category))",
    )
    .eq("operator_id", operatorId)
    .in("status", COMMITTED)
    .gte("start_date", first)
    .lte("start_date", last);
  if (error) throw new Error(`getCalendarMonth failed: ${error.message}`);
  const rows = (data ?? []) as unknown as BRow[];

  const byDay = new Map<number, BRow[]>();
  for (const b of rows) {
    const day = Number(b.start_date.slice(8, 10));
    (byDay.get(day) ?? byDay.set(day, []).get(day)!).push(b);
  }

  const leadingBlanks = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const cells: CalDay[] = [];
  for (let i = 0; i < leadingBlanks; i++) cells.push(blank());

  for (let d = 1; d <= daysInMonth; d++) {
    const dayBookings = byDay.get(d) ?? [];
    const events: CalEvent[] = [];
    const reserved = new Map<string, number>();
    for (const b of dayBookings) {
      for (const li of b.booking_items ?? []) {
        events.push({
          label: shortLabel(li.items?.name ?? "Item", li.quantity),
          category: toCategory(li.items?.category ?? null),
        });
        reserved.set(li.item_id, (reserved.get(li.item_id) ?? 0) + li.quantity);
      }
    }
    const fullyBooked =
      bounceOwned.length > 0 &&
      bounceOwned.every((bi) => (reserved.get(bi.id) ?? 0) >= bi.quantity);
    cells.push({
      date: d,
      events: events.slice(0, 2),
      fullyBooked,
      moreCount: Math.max(0, events.length - 2),
    });
  }
  while (cells.length % 7 !== 0) cells.push(blank());

  const selDay = byDay.has(12) ? 12 : [...byDay.keys()].sort((a, b) => a - b)[0] ?? 1;
  const selected = buildDetail(year, month, selDay, byDay.get(selDay) ?? [], bounceOwned, byDay);

  return { monthLabel: `${MONTHS[month - 1]} ${year}`, monthDays: cells, selected };
}

function buildDetail(
  year: number,
  month: number,
  day: number,
  dayBookings: BRow[],
  bounceOwned: { id: string; quantity: number }[],
  byDay: Map<number, BRow[]>,
): SelectedDayDetail | null {
  const dow = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  const dateLabel = `${WEEKDAY[dow]}, ${MONTHS[month - 1].slice(0, 3)} ${day}`;

  if (dayBookings.length === 0) {
    return { date: day, dateLabel, fullyBooked: false, summary: "No bookings", booking: null, contract: null, balance: null, alsoOut: [] };
  }

  // Fully booked if every bounce unit is reserved this day.
  const reserved = new Map<string, number>();
  for (const b of dayBookings)
    for (const li of b.booking_items ?? [])
      reserved.set(li.item_id, (reserved.get(li.item_id) ?? 0) + li.quantity);
  const fullyBooked =
    bounceOwned.length > 0 && bounceOwned.every((bi) => (reserved.get(bi.id) ?? 0) >= bi.quantity);

  // Primary booking: prefer a contracted one (contract on file), else the first.
  const primary = dayBookings.find((b) => b.status === "contracted") ?? dayBookings[0];
  const pItem = primary.booking_items?.[0];
  const contractSigned = ["contracted", "confirmed", "completed"].includes(primary.status);
  const balanceDue = primary.subtotal - (primary.deposit ?? 0);

  return {
    date: day,
    dateLabel,
    fullyBooked,
    summary: `${dayBookings.length} bookings out${fullyBooked ? " · all inventory reserved" : ""}`,
    booking: {
      customer: primary.customer_name ?? "Customer",
      bookingNo: `Booking #${primary.id.slice(0, 4).toUpperCase()}`,
      item: pItem?.items?.name ?? "—",
      price: pItem ? `${money(pItem.unit_price)} / day` : "—",
      location: "Plymouth, MA",
      deliver: primary.delivery_window ?? "—",
      pickup: "5:00 PM",
    },
    contract: contractSigned
      ? { label: "Contract signed", detail: `${primary.customer_name ?? "Customer"} · e-signed` }
      : { label: "Contract pending", detail: "Awaiting signature" },
    balance:
      balanceDue > 0
        ? {
            label: "Balance due on delivery",
            detail: `${money(primary.deposit ?? 0)} paid · ${money(balanceDue)} balance`,
          }
        : { label: "Paid in full", detail: money(primary.subtotal) },
    alsoOut: dayBookings
      .filter((b) => b.id !== primary.id)
      .map((b) => ({
        item: shortLabel(b.booking_items?.[0]?.items?.name ?? "Booking", b.booking_items?.[0]?.quantity ?? 1),
        time: b.delivery_window ?? "—",
      })),
  };
}
