/**
 * Current calendar date (YYYY-MM-DD) in the operator's timezone.
 *
 * Server code runs in UTC on Vercel, so `new Date().getDate()` rolls over to
 * tomorrow after ~8pm US Eastern — the "today" default for the calendar and
 * deliveries route would jump a day. Format in an explicit zone instead.
 *
 * Fixed to US Eastern for now (the operator base). TODO: store a per-operator
 * timezone (Settings) and pass it here for true multi-tenant correctness.
 */
export function operatorToday(tz = "America/New_York"): string {
  // en-CA renders as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date());
}
