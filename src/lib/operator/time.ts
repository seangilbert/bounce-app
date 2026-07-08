/**
 * Timezone helpers. Server code runs in UTC on Vercel, so `new Date().getDate()`
 * rolls over to tomorrow after ~8pm US Eastern — the "today" default for the
 * calendar, deliveries route, and dashboard would jump a day. Format in the
 * operator's own zone (stored on `operators.timezone`) instead.
 */

const FALLBACK_TZ = "America/New_York";

/** Selectable timezones (US-focused). Value is an IANA zone. */
export const TIMEZONES: { value: string; label: string }[] = [
  { value: "America/New_York", label: "Eastern — New York" },
  { value: "America/Chicago", label: "Central — Chicago" },
  { value: "America/Denver", label: "Mountain — Denver" },
  { value: "America/Phoenix", label: "Arizona — Phoenix (no DST)" },
  { value: "America/Los_Angeles", label: "Pacific — Los Angeles" },
  { value: "America/Anchorage", label: "Alaska — Anchorage" },
  { value: "Pacific/Honolulu", label: "Hawaii — Honolulu" },
];

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Current calendar date (YYYY-MM-DD) in the given timezone; falls back to
 *  US Eastern if the zone is missing or invalid. */
export function operatorToday(tz?: string | null): string {
  const zone = tz && isValidTimeZone(tz) ? tz : FALLBACK_TZ;
  // en-CA renders as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", { timeZone: zone }).format(new Date());
}
