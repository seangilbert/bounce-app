import { createClient } from "@/utils/supabase/server";
import type { ReminderKind } from "./repo";

/**
 * Per-agent activity counts for the Agents page — what each follow-up agent
 * actually DID, from the send-logs (booking_reminders 0061, document_reminders
 * 0064). User-scoped client: both tables carry an operator SELECT policy, so
 * RLS scopes the read and the service-role allowlist stays untouched.
 *
 * Error posture matches getAiQuoteUsage: log + return zeros — the Agents page
 * must never 500 over a stats read.
 */

export interface AgentStat {
  /** Sent this UTC calendar month (same convention as currentUsageMonth). */
  month: number;
  /** Sent all time. */
  total: number;
}

export interface AgentStats {
  balance: AgentStat;
  contract: AgentStat;
  quote: AgentStat;
  docExpiry: AgentStat;
}

const zero = (): AgentStat => ({ month: 0, total: 0 });

export async function getAgentStats(operatorId: string): Promise<AgentStats> {
  const stats: AgentStats = { balance: zero(), contract: zero(), quote: zero(), docExpiry: zero() };
  const monthPrefix = new Date().toISOString().slice(0, 7); // "YYYY-MM"
  const inMonth = (sentAt: string) => sentAt >= monthPrefix;

  const supabase = createClient();
  const [bookings, docs] = await Promise.all([
    supabase.from("booking_reminders").select("kind, sent_at").eq("operator_id", operatorId),
    supabase.from("document_reminders").select("sent_at").eq("operator_id", operatorId),
  ]);

  if (bookings.error) {
    console.error("[agents] booking reminder stats failed:", bookings.error.message);
  } else {
    for (const row of (bookings.data ?? []) as { kind: ReminderKind; sent_at: string }[]) {
      const bucket = stats[row.kind];
      if (!bucket) continue; // future kinds don't break the page
      bucket.total++;
      if (inMonth(row.sent_at)) bucket.month++;
    }
  }

  if (docs.error) {
    console.error("[agents] document reminder stats failed:", docs.error.message);
  } else {
    for (const row of (docs.data ?? []) as { sent_at: string }[]) {
      stats.docExpiry.total++;
      if (inMonth(row.sent_at)) stats.docExpiry.month++;
    }
  }

  return stats;
}
