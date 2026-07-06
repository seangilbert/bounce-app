import { createAdminClient } from "@/utils/supabase/admin";
import type {
  CalDay,
  CalEvent,
  CalendarMonth,
  ItemCategory,
  SelectedDayDetail,
} from "./calendar";
import type { InquiryListItem, InquiryDetail } from "./inquiries";
import { listInquiries, type InquiryRow } from "@/lib/inquiries/repo";
import { expireStaleCheckouts } from "@/lib/bookings/expire";
import type { Stop } from "./mock";

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
  delivery_zip?: string | null;
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
  await expireStaleCheckouts();
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
      id: primary.id,
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

/* ══════════════════════ Inquiries ══════════════════════ */

function initials(name: string): string {
  return name.split(/\s+/).map((p) => p[0]).join("").slice(0, 2).toUpperCase();
}

/** Relative timestamp for the inbox, e.g. "6:52 AM", "Yesterday", "Jul 3". */
function relTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString())
    return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  const yest = new Date(now);
  yest.setDate(now.getDate() - 1);
  if (d.toDateString() === yest.toDateString()) return "Yesterday";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** "Sat, Jul 12" from a date-only ISO string (UTC). */
function fmtEventDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return `${WEEKDAY[d.getUTCDay()].slice(0, 3)}, ${MONTHS[d.getUTCMonth()].slice(0, 3)} ${d.getUTCDate()}`;
}

function friendlyWhy(reasons: string[]): string {
  if (!reasons.length) return "I flagged this inquiry for your review.";
  return `I didn't auto-send because ${reasons.join("; ")}.`;
}

function rowToListItem(r: InquiryRow): InquiryListItem {
  const name = r.customer_name ?? "Website visitor";
  const top = r.quote?.lineItems[0];
  const preview =
    r.status === "auto"
      ? top
        ? `${top.name} quoted ${money(top.unitPrice)}/day · auto-sent`
        : r.ai_summary ?? r.inbound_message
      : `“${r.inbound_message}”`;
  return {
    id: r.id,
    name,
    initials: initials(name),
    time: relTime(r.created_at),
    status: r.status === "needs_review" ? "needs_review" : r.status === "replied" ? "replied" : "auto",
    preview: r.status === "replied" ? `You replied · ${r.operator_reply ?? ""}` : preview,
    customerType: r.customer_type ?? "New customer",
    location: r.location ?? r.customer_email ?? "via your website",
  };
}

function rowToDetail(r: InquiryRow): InquiryDetail {
  const message = { text: r.inbound_message, meta: `${relTime(r.created_at)} · via your ${r.channel}` };
  const q = r.quote;

  if (r.status === "replied") {
    return { message, handledNote: r.operator_reply ?? r.ai_summary ?? "Replied." };
  }

  if (r.status === "auto") {
    const note = q?.lineItems.length
      ? `${q.lineItems.map((l) => `${l.quantity > 1 ? `${l.quantity}× ` : ""}${l.name}`).join(", ")} · ${money(q.subtotal)} · auto-sent`
      : r.ai_summary ?? "Auto-answered.";
    return { message, handledNote: r.ai_summary ?? note };
  }

  // needs_review → show the AI's drafted reply for the operator to send/edit.
  const top = q?.lineItems[0];
  const draft = r.ai_summary ?? "I've flagged this for you — add a reply below.";
  return {
    message,
    whyBanner: friendlyWhy(r.escalation_reasons),
    aiDraft: {
      match: top
        ? {
            name: q!.lineItems.length > 1 ? `${top.name} +${q!.lineItems.length - 1} more` : top.name,
            availabilityLabel: fmtEventDate(r.start_date),
            price: q!.lineItems.length > 1 ? money(q!.subtotal) : money(top.unitPrice),
            unit: q!.lineItems.length > 1 ? "total" : "/ day",
          }
        : { name: "No catalog match", availabilityLabel: fmtEventDate(r.start_date), price: "—", unit: "" },
      message: draft,
      replyDraft: draft,
    },
  };
}

/**
 * Inbox from the persisted `inquiries` table — real AI drafts, quotes, and
 * escalation reasons, written by the Quote Assistant on every inquiry.
 */
export async function getInquiries(operatorId: string): Promise<{
  list: InquiryListItem[];
  filters: { all: number; needsYou: number; auto: number };
  details: Record<string, InquiryDetail>;
}> {
  const rows = (await listInquiries(operatorId)).filter((r) => r.status !== "dismissed");
  const list = rows.map(rowToListItem);
  const details: Record<string, InquiryDetail> = {};
  for (const r of rows) details[r.id] = rowToDetail(r);
  const needsYou = list.filter((l) => l.status === "needs_review").length;
  return { list, filters: { all: list.length, needsYou, auto: list.length - needsYou }, details };
}

/* ══════════════════════ Dashboard ══════════════════════ */

const MONTHS_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const WEEKDAY_FULL = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
const WEEKDAY_ABBR = ["SUN","MON","TUE","WED","THU","FRI","SAT"];

export interface DashboardData {
  dateLabel: string;
  routeSummary: string;
  revenue: string;
  bookings: number;
  needsYou: number;
  quotesSent: number;
  booked: number;
  flaggedSummary: string | null;
  todayStops: Stop[];
  comingUp: { month: string; day: string; title: string; subtitle: string; tone: "coral" | "muted" }[];
}

function ymd(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

export async function getDashboard(operatorId: string): Promise<DashboardData> {
  const supabase = createAdminClient();
  await expireStaleCheckouts();
  const now = new Date();
  const today = ymd(now);
  const dow = now.getUTCDay();
  const weekStart = new Date(now); weekStart.setUTCDate(now.getUTCDate() - dow);
  const weekEnd = new Date(weekStart); weekEnd.setUTCDate(weekStart.getUTCDate() + 6);

  const { data: items } = await supabase.from("items").select("id, category, quantity").eq("operator_id", operatorId);
  const bounceOwned = (items ?? []).filter((i) => toCategory(i.category) === "bounce");

  const { data: cData } = await supabase
    .from("bookings")
    .select("id, start_date, customer_name, status, delivery_window, delivery_zip, subtotal, booking_items(item_id, quantity, items(name, category))")
    .eq("operator_id", operatorId)
    .in("status", COMMITTED)
    .gte("start_date", today);
  const committed = (cData ?? []) as unknown as BRow[];

  const { data: weekData } = await supabase
    .from("bookings")
    .select("subtotal")
    .eq("operator_id", operatorId)
    .in("status", COMMITTED)
    .gte("start_date", ymd(weekStart))
    .lte("start_date", ymd(weekEnd));
  const revenueCents = (weekData ?? []).reduce((s, b) => s + (b.subtotal ?? 0), 0);

  const inqRows = await listInquiries(operatorId);
  const needsYou = inqRows.filter((r) => r.status === "needs_review").length;
  const quotesSent = inqRows.filter((r) => r.status === "auto").length;
  const flagged = inqRows.find((r) => r.status === "needs_review");

  // Today's route
  const todayStops: Stop[] = committed
    .filter((b) => b.start_date === today)
    .map((b) => {
      const [time, meridiem] = (b.delivery_window ?? "— ").split(" ");
      return {
        time: time ?? "—",
        meridiem: meridiem ?? "",
        type: "DELIVER" as const,
        item: b.booking_items?.[0]?.items?.name ?? "Booking",
        customer: b.customer_name ?? "Customer",
        address: b.delivery_zip ? `ZIP ${b.delivery_zip}` : "Plymouth",
        status: { label: "Scheduled", tone: "muted" as const },
      };
    });

  // Coming up: next fully-booked day + the escalated inquiry
  const byDay = new Map<string, BRow[]>();
  for (const b of committed) (byDay.get(b.start_date) ?? byDay.set(b.start_date, []).get(b.start_date)!).push(b);
  const comingUp: DashboardData["comingUp"] = [];
  const fbDay = [...byDay.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .find(([, bs]) => {
      const reserved = new Map<string, number>();
      for (const bk of bs) for (const li of bk.booking_items ?? []) reserved.set(li.item_id, (reserved.get(li.item_id) ?? 0) + li.quantity);
      return bounceOwned.length > 0 && bounceOwned.every((bi) => (reserved.get(bi.id) ?? 0) >= bi.quantity);
    });
  if (fbDay) {
    const d = new Date(`${fbDay[0]}T00:00:00Z`);
    comingUp.push({ month: WEEKDAY_ABBR[d.getUTCDay()], day: String(d.getUTCDate()), title: "Fully booked", subtitle: `${fbDay[1].length} bookings out`, tone: "coral" });
  }
  if (flagged) {
    comingUp.push({ month: "NEW", day: "•", title: "Quote to review", subtitle: `${flagged.customer_name ?? "Website visitor"} · needs you`, tone: "muted" });
  }

  return {
    dateLabel: `${WEEKDAY_FULL[dow]}, ${MONTHS_SHORT[now.getUTCMonth()]} ${now.getUTCDate()}`,
    routeSummary: `${todayStops.length} ${todayStops.length === 1 ? "stop" : "stops"} on today's route`,
    revenue: money(revenueCents),
    bookings: committed.length,
    needsYou,
    quotesSent,
    booked: quotesSent,
    flaggedSummary: flagged?.inbound_message ?? null,
    todayStops,
    comingUp,
  };
}
