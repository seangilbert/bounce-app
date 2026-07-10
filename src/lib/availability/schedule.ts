/**
 * Operator availability schedule: which weekdays they deliver, the named
 * delivery windows customers pick at checkout, and blackout date ranges that
 * can't be booked. Day-granular (the rental model is day-level). Pure — the
 * single source of truth for enforcing bookable dates across createBooking,
 * the AI quote, and the storefront.
 */

export interface BlackoutRange {
  /** Inclusive YYYY-MM-DD. A single day has start === end. */
  start: string;
  end: string;
}

export interface Schedule {
  /** Open weekdays, 0=Sun … 6=Sat. */
  operatingDays: number[];
  /** Named delivery windows, e.g. "8–10am". Empty = no fixed windows. */
  deliveryWindows: string[];
  blackouts: BlackoutRange[];
}

const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];
const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** Defaulted, validated schedule from the operator's raw JSONB. */
export function normalizeSchedule(raw: unknown): Schedule {
  const c = (raw ?? {}) as Partial<Schedule>;
  // Missing operatingDays → all days open (preserves pre-feature behavior).
  const days = Array.isArray(c.operatingDays)
    ? [...new Set(c.operatingDays.map(Number).filter((d) => d >= 0 && d <= 6))].sort()
    : ALL_DAYS;
  const deliveryWindows = Array.isArray(c.deliveryWindows)
    ? c.deliveryWindows.map((w) => String(w).trim()).filter(Boolean)
    : [];
  const blackouts = Array.isArray(c.blackouts)
    ? c.blackouts
        .map((b) => ({ start: String(b?.start ?? ""), end: String(b?.end ?? b?.start ?? "") }))
        .filter((b) => ISO.test(b.start) && ISO.test(b.end))
        .map((b) => (b.end < b.start ? { start: b.end, end: b.start } : b))
    : [];
  return { operatingDays: days.length ? days : ALL_DAYS, deliveryWindows, blackouts };
}

/** UTC weekday (0=Sun) for a YYYY-MM-DD, timezone-agnostic. */
function weekdayOf(iso: string): number {
  return new Date(`${iso}T00:00:00Z`).getUTCDay();
}

function inAnyBlackout(iso: string, blackouts: BlackoutRange[]): boolean {
  return blackouts.some((b) => iso >= b.start && iso <= b.end);
}

const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function prettyDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

/** True if a single date is an operating day and not blacked out. */
export function isDateBookable(schedule: Schedule, iso: string): boolean {
  return schedule.operatingDays.includes(weekdayOf(iso)) && !inAnyBlackout(iso, schedule.blackouts);
}

export interface RangeAssessment {
  ok: boolean;
  /** Customer-facing explanation when not bookable. */
  message?: string;
}

/**
 * Assess a rental range: the delivery day (start) must be an operating day, and
 * no day in [start, end] may be blacked out. Returns a friendly message so the
 * same wording flows to the storefront, the API error, and the AI reply.
 */
export function assessRange(schedule: Schedule, start: string, end: string): RangeAssessment {
  if (!ISO.test(start) || !ISO.test(end)) return { ok: true }; // let other validation handle bad input
  if (!schedule.operatingDays.includes(weekdayOf(start))) {
    return { ok: false, message: `We don't deliver on ${WEEKDAY_NAMES[weekdayOf(start)]}s — please pick another day.` };
  }
  // Walk each day of the (usually short) range checking blackouts.
  let cursor = start;
  while (cursor <= end) {
    if (inAnyBlackout(cursor, schedule.blackouts)) {
      return { ok: false, message: `We're not available on ${prettyDate(cursor)} — please pick another date.` };
    }
    cursor = addDay(cursor);
    if (cursor > end) break;
  }
  return { ok: true };
}

/** YYYY-MM-DD one day later (UTC). */
function addDay(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}
