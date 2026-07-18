import type { CustomerStats } from "./repo";

/**
 * A lead is someone who has shown interest but never committed money — they
 * saved an item, or asked a question, and haven't booked.
 *
 * Derived from the bookings, NOT from `source`: `source` is first-touch and
 * never changes, so someone who saved an item and then booked is still
 * source='saved' but is emphatically no longer a lead. Deriving it from actual
 * bookings is the only definition that stays true over time.
 *
 * Lives apart from repo.ts (which imports the server-only Supabase client) so
 * client components can import this pure helper without pulling `next/headers`
 * into the browser bundle.
 */
export function isLead(stats: CustomerStats): boolean {
  return stats.bookingCount === 0;
}
