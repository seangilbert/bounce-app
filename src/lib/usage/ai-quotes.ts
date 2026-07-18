/**
 * AI-quote usage metering. The Free plan caps AI-assisted quote conversations at
 * `PLAN_CAPABILITIES.free.aiQuotesPerMonth` per calendar month — this both keeps
 * the free tier a taste and bounds our Anthropic spend. Counts are durable
 * (Postgres, see migration 0038) so they hold across serverless instances, and
 * keyed by UTC month so they reset at the boundary with no cron.
 *
 * A "quote" is one conversation that reached a recommendation — we increment
 * once, when the inbox inquiry is first persisted (see `handleInquiry`), not per
 * chat turn. Paid plans are unlimited (`Infinity`) and skip the DB entirely.
 */
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { planCapabilities } from "@/lib/plans";
import type { Operator } from "@/lib/inventory/types";

/** Current usage bucket: UTC calendar month as 'YYYY-MM'. */
export function currentUsageMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

/** This month's AI-quote count for an operator (0 if none recorded yet). */
export async function getAiQuoteUsage(
  operatorId: string,
  month: string = currentUsageMonth(),
): Promise<number> {
  const admin = createClient();
  const { data, error } = await admin
    .from("operator_ai_usage")
    .select("count")
    .eq("operator_id", operatorId)
    .eq("month", month)
    .maybeSingle();
  if (error) {
    console.error("[usage] getAiQuoteUsage failed:", error.message);
    return 0;
  }
  return (data?.count as number | undefined) ?? 0;
}

/** Atomically bump this month's counter; returns the new total. */
export async function incrementAiQuoteUsage(
  operatorId: string,
  month: string = currentUsageMonth(),
): Promise<number> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("increment_ai_usage", {
    p_operator_id: operatorId,
    p_month: month,
  });
  if (error) throw new Error(`increment_ai_usage failed: ${error.message}`);
  return (data as number | null) ?? 0;
}

export interface QuoteQuota {
  used: number;
  /** Monthly cap for the operator's effective plan; `Infinity` for paid. */
  limit: number;
  /** Remaining before the cap; `Infinity` for paid. */
  remaining: number;
  /** True once the cap is reached (never true for paid plans). */
  atLimit: boolean;
  /** Whether this plan is metered at all (false for unlimited plans). */
  metered: boolean;
}

/**
 * Resolve an operator's AI-quote quota for the current month. Skips the DB read
 * for unlimited plans, so the common (paid) case stays free of a round-trip.
 */
export async function getQuoteQuota(operator: Operator): Promise<QuoteQuota> {
  const limit = planCapabilities(operator).aiQuotesPerMonth;
  if (!Number.isFinite(limit)) {
    return { used: 0, limit, remaining: Infinity, atLimit: false, metered: false };
  }
  const used = await getAiQuoteUsage(operator.id);
  return {
    used,
    limit,
    remaining: Math.max(0, limit - used),
    atLimit: used >= limit,
    metered: true,
  };
}
