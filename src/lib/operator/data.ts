import { createAdminClient } from "@/utils/supabase/admin";
import { operatorToday } from "./time";
import type {
  CalDayData,
  CalEvent,
  CalendarData,
  CatFilter,
  ItemCategory,
  SelectedBooking,
  SelectedDayDetail,
} from "./calendar";
import type { InquiryListItem, InquiryDetail, BookingOutcome } from "./inquiries";
import { bookingsForOutcomes, type OutcomeBookingRow } from "@/lib/bookings/repo";
import { listInquiries, listMessagesByInquiry, type InquiryRow, type ThreadMessage } from "@/lib/inquiries/repo";
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
 * Calendar view model for the operator calendar, computed from live bookings.
 * Covers the full visible grid (whole weeks, including adjacent-month days so the
 * Week view has data), with a per-day detail precomputed so the client can select
 * days instantly. Optionally filtered to a single item category.
 *
 * "Fully booked" = every bounce-house unit is reserved that day (the constrained
 * inventory), i.e. the same reservation logic the availability engine enforces.
 */
export async function getCalendarData(
  operatorId: string,
  year: number,
  month: number,
  category: CatFilter = "all",
  tz?: string,
): Promise<CalendarData> {
  const supabase = createAdminClient();
  const pad = (n: number) => String(n).padStart(2, "0");
  const isoOf = (ts: number) => {
    const dt = new Date(ts);
    return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
  };

  // Visible grid: from the Sunday on/before the 1st, padded to whole weeks.
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const leading = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const totalCells = Math.ceil((leading + daysInMonth) / 7) * 7;
  const gridStartTs = Date.UTC(year, month - 1, 1) - leading * 86_400_000;
  const gridEndTs = gridStartTs + (totalCells - 1) * 86_400_000;

  const [, itemsRes, bookingsRes] = await Promise.all([
    expireStaleCheckouts(),
    supabase.from("items").select("id, category, quantity").eq("operator_id", operatorId),
    supabase
      .from("bookings")
      .select(
        "id, start_date, customer_name, status, delivery_window, subtotal, deposit, booking_items(item_id, quantity, unit_price, items(name, category))",
      )
      .eq("operator_id", operatorId)
      .in("status", COMMITTED)
      .gte("start_date", isoOf(gridStartTs))
      .lte("start_date", isoOf(gridEndTs)),
  ]);
  const bounceOwned = (itemsRes.data ?? []).filter((i) => toCategory(i.category) === "bounce");
  if (bookingsRes.error) throw new Error(`getCalendarData failed: ${bookingsRes.error.message}`);
  const rows = (bookingsRes.data ?? []) as unknown as BRow[];

  const byIso = new Map<string, BRow[]>();
  for (const b of rows) {
    const key = b.start_date.slice(0, 10);
    (byIso.get(key) ?? byIso.set(key, []).get(key)!).push(b);
  }

  const catMatches = (li: BItem) => category === "all" || toCategory(li.items?.category ?? null) === category;

  const days: CalDayData[] = [];
  for (let i = 0; i < totalCells; i++) {
    const ts = gridStartTs + i * 86_400_000;
    const dt = new Date(ts);
    const iso = isoOf(ts);
    const mm = dt.getUTCMonth() + 1;
    const allDay = byIso.get(iso) ?? [];

    // Fully-booked reflects real bounce inventory (independent of the filter).
    const reserved = new Map<string, number>();
    for (const b of allDay)
      for (const li of b.booking_items ?? [])
        reserved.set(li.item_id, (reserved.get(li.item_id) ?? 0) + li.quantity);
    const fullyBooked =
      bounceOwned.length > 0 && bounceOwned.every((bi) => (reserved.get(bi.id) ?? 0) >= bi.quantity);

    // Events + detail respect the category filter.
    const dayBookings = allDay
      .map((b) => ({ ...b, booking_items: (b.booking_items ?? []).filter(catMatches) }))
      .filter((b) => b.booking_items.length > 0);

    // One pill per booking, headlined by its main item (prefer the bounce house,
    // the constrained inventory) with a "+N" when the booking has more items.
    const events: CalEvent[] = dayBookings.map((b) => {
      const lis = b.booking_items;
      const primary = lis.find((li) => toCategory(li.items?.category ?? null) === "bounce") ?? lis[0];
      const base = shortLabel(primary?.items?.name ?? "Item", primary?.quantity ?? 1);
      const extra = lis.length - 1;
      return {
        label: extra > 0 ? `${base} +${extra}` : base,
        category: toCategory(primary?.items?.category ?? null),
        bookingId: b.id,
      };
    });

    days.push({
      iso,
      dayNum: dt.getUTCDate(),
      weekday: dt.getUTCDay(),
      inMonth: mm === month,
      events,
      fullyBooked,
      detail: buildDayDetail(iso, dt, dayBookings, fullyBooked),
    });
  }

  // Default selection: a day-of-the-month with bookings, else the 1st.
  const withBookings = days.find((d) => d.inMonth && d.events.length > 0);
  const firstOfMonth = days.find((d) => d.inMonth);

  return {
    year,
    month,
    monthLabel: `${MONTHS[month - 1]} ${year}`,
    todayIso: operatorToday(tz),
    days,
    defaultSelectedIso: (withBookings ?? firstOfMonth)?.iso ?? null,
    category,
  };
}

function buildDayDetail(
  iso: string,
  dt: Date,
  dayBookings: BRow[],
  fullyBooked: boolean,
): SelectedDayDetail {
  const dateLabel = `${WEEKDAY[dt.getUTCDay()]}, ${MONTHS[dt.getUTCMonth()].slice(0, 3)} ${dt.getUTCDate()}`;

  // Contracted bookings (contract on file) first, otherwise stable order.
  const ordered = [...dayBookings].sort((a, b) => Number(b.status === "contracted") - Number(a.status === "contracted"));

  const bookings: SelectedBooking[] = ordered.map((b) => {
    const contractSigned = ["contracted", "confirmed", "completed"].includes(b.status);
    const balanceDue = b.subtotal - (b.deposit ?? 0);
    return {
      id: b.id,
      customer: b.customer_name ?? "Customer",
      bookingNo: `Booking #${b.id.slice(0, 4).toUpperCase()}`,
      lineItems: (b.booking_items ?? []).map((li) => ({
        name: li.items?.name ?? "Item",
        qty: li.quantity,
        price: `${money(li.unit_price)} / day`,
        category: toCategory(li.items?.category ?? null),
      })),
      location: "Plymouth, MA",
      deliver: b.delivery_window ?? "—",
      pickup: "5:00 PM",
      contract: contractSigned
        ? { label: "Contract signed", detail: `${b.customer_name ?? "Customer"} · e-signed` }
        : { label: "Contract pending", detail: "Awaiting signature" },
      balance:
        balanceDue > 0
          ? { label: "Balance due on delivery", detail: `${money(b.deposit ?? 0)} paid · ${money(balanceDue)} balance` }
          : { label: "Paid in full", detail: money(b.subtotal) },
    };
  });

  return {
    iso,
    dateLabel,
    fullyBooked,
    summary:
      dayBookings.length === 0
        ? "No bookings"
        : `${dayBookings.length} booking${dayBookings.length === 1 ? "" : "s"} out${fullyBooked ? " · all inventory reserved" : ""}`,
    bookings,
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

function rowToListItem(r: InquiryRow): Omit<InquiryListItem, "outcome"> {
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

function rowToDetail(r: InquiryRow, msgs: ThreadMessage[]): Omit<InquiryDetail, "outcome"> {
  const source: ThreadMessage[] = msgs.length
    ? msgs
    : [{ id: `${r.id}-inbound`, sender: "customer", body: r.inbound_message, createdAt: r.created_at }];
  const thread = source.map((m) => ({
    id: m.id,
    sender: m.sender,
    body: m.body,
    time: relTime(m.createdAt),
  }));
  const channelMeta = `${relTime(r.created_at)} · via your ${r.channel}`;
  const email = r.customer_email;
  const prefill = {
    items: (r.quote?.lineItems ?? []).map((l) => ({ itemId: l.itemId, quantity: l.quantity })),
    startDate: r.start_date,
    endDate: r.end_date,
    customerName: r.customer_name,
    customerEmail: r.customer_email,
  };

  // The AI draft is a *suggestion* only while it's an unsent needs_review draft.
  if (r.status !== "needs_review") {
    return { channelMeta, email, prefill, thread };
  }

  const q = r.quote;
  const top = q?.lineItems[0];
  const draft = r.ai_summary ?? "I've flagged this for you — add a reply below.";
  return {
    channelMeta,
    email,
    prefill,
    thread,
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

const BOOKED_STATUSES = new Set(["paid", "contracted", "confirmed", "delivered", "completed"]);
const OUTCOME_RANK: Record<BookingOutcome["status"], number> = { booked: 3, pending: 2, canceled: 1, none: 0 };

function outcomeStatusOf(s: string): BookingOutcome["status"] {
  if (BOOKED_STATUSES.has(s)) return "booked";
  if (s === "pending_payment") return "pending";
  if (s === "canceled") return "canceled";
  return "none"; // quoted / anything uncommitted
}

function bookingToOutcome(b: OutcomeBookingRow): BookingOutcome {
  const status = outcomeStatusOf(b.status);
  if (status === "none") return { status: "none" };
  return {
    status,
    bookingId: b.id,
    amount: b.total != null ? money(b.total) : undefined,
    dateLabel: fmtEventDate(b.start_date),
  };
}

/**
 * Did each inquiry become a booking? Explicit link (`inquiry.booking_id`, set
 * when the chat quote is booked) first; otherwise a heuristic match by customer
 * email + overlapping dates. Batched into two booking queries, not N+1.
 */
async function resolveOutcomes(
  operatorId: string,
  rows: InquiryRow[],
): Promise<Map<string, BookingOutcome>> {
  const map = new Map<string, BookingOutcome>();
  const bookingIds = rows.map((r) => r.booking_id).filter((x): x is string => !!x);
  const emails = [
    ...new Set(rows.filter((r) => !r.booking_id && r.customer_email).map((r) => r.customer_email!.toLowerCase())),
  ];
  if (bookingIds.length === 0 && emails.length === 0) return map;

  const bookings = await bookingsForOutcomes(operatorId, bookingIds, emails);
  const byId = new Map(bookings.map((b) => [b.id, b]));

  for (const r of rows) {
    if (r.booking_id && byId.has(r.booking_id)) {
      map.set(r.id, bookingToOutcome(byId.get(r.booking_id)!));
      continue;
    }
    if (r.customer_email) {
      const email = r.customer_email.toLowerCase();
      const candidates = bookings
        .filter(
          (b) =>
            (b.customer_email ?? "").toLowerCase() === email &&
            outcomeStatusOf(b.status) !== "none" &&
            b.start_date <= r.end_date &&
            b.end_date >= r.start_date,
        )
        .sort((a, b) => {
          const d = OUTCOME_RANK[outcomeStatusOf(b.status)] - OUTCOME_RANK[outcomeStatusOf(a.status)];
          return d !== 0 ? d : b.start_date.localeCompare(a.start_date);
        });
      if (candidates.length) {
        map.set(r.id, bookingToOutcome(candidates[0]!));
        continue;
      }
    }
    map.set(r.id, { status: "none" });
  }
  return map;
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
  const [msgMap, outcomes] = await Promise.all([
    listMessagesByInquiry(rows.map((r) => r.id)),
    resolveOutcomes(operatorId, rows),
  ]);
  const noOutcome: BookingOutcome = { status: "none" };
  const list = rows.map((r) => ({ ...rowToListItem(r), outcome: outcomes.get(r.id) ?? noOutcome }));
  const details: Record<string, InquiryDetail> = {};
  for (const r of rows) {
    details[r.id] = { ...rowToDetail(r, msgMap.get(r.id) ?? []), outcome: outcomes.get(r.id) ?? noOutcome };
  }
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

export async function getDashboard(operatorId: string, tz?: string): Promise<DashboardData> {
  const supabase = createAdminClient();
  // Anchor on the operator's local "today" (server runs in UTC — see time.ts),
  // then do week math in UTC on that date so ymd() lines up.
  const today = operatorToday(tz);
  const todayDate = new Date(`${today}T00:00:00Z`);
  const dow = todayDate.getUTCDay();
  const weekStart = new Date(todayDate); weekStart.setUTCDate(todayDate.getUTCDate() - dow);
  const weekEnd = new Date(weekStart); weekEnd.setUTCDate(weekStart.getUTCDate() + 6);

  // Independent — fetch in parallel instead of one round-trip after another.
  const [, itemsRes, cRes, weekRes, inqRows] = await Promise.all([
    expireStaleCheckouts(),
    supabase.from("items").select("id, category, quantity").eq("operator_id", operatorId),
    supabase
      .from("bookings")
      .select("id, start_date, customer_name, status, delivery_window, delivery_zip, subtotal, booking_items(item_id, quantity, items(name, category))")
      .eq("operator_id", operatorId)
      .in("status", COMMITTED)
      .gte("start_date", today),
    supabase
      .from("bookings")
      .select("subtotal")
      .eq("operator_id", operatorId)
      .in("status", COMMITTED)
      .gte("start_date", ymd(weekStart))
      .lte("start_date", ymd(weekEnd)),
    listInquiries(operatorId),
  ]);
  const bounceOwned = (itemsRes.data ?? []).filter((i) => toCategory(i.category) === "bounce");
  const committed = (cRes.data ?? []) as unknown as BRow[];
  const revenueCents = (weekRes.data ?? []).reduce((s, b) => s + (b.subtotal ?? 0), 0);
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
    dateLabel: `${WEEKDAY_FULL[dow]}, ${MONTHS_SHORT[todayDate.getUTCMonth()]} ${todayDate.getUTCDate()}`,
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
