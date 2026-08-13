import { createClient } from "@/utils/supabase/server";
import { planCapabilities } from "@/lib/plans";
import { DOC_TYPES } from "@/lib/documents/types";
import type { Operator } from "@/lib/inventory/types";

/**
 * Operator onboarding v2 — the "Get set up" activation checklist.
 *
 * Every step is DERIVED from data the app already has (catalog, documents,
 * inquiries, plus columns on the operator row), so there is no progress table
 * to keep in sync and no way for the checklist to disagree with reality: turn
 * a feature on anywhere in the app and the step ticks itself.
 *
 * Reads are user-scoped — items (0054), documents (0055) and inquiries (0054)
 * all carry an operator SELECT policy, so RLS does the scoping and the
 * service-role allowlist stays untouched. Error posture matches getAgentStats:
 * log + treat the count as zero. A dashboard must never 500 over a checklist.
 */

export type SetupStepKey =
  | "location"
  | "items"
  | "payments"
  | "documents"
  | "followUps"
  | "policies"
  | "branding"
  | "voice"
  | "testDrive";

export interface SetupStep {
  key: SetupStepKey;
  done: boolean;
}

export interface SetupProgress {
  /** Applicable steps in display order (value order after the core three). */
  steps: SetupStep[];
  doneCount: number;
  total: number;
  complete: boolean;
  /** The operator hid the dashboard card (setup_dismissed_at, 0065). */
  dismissed: boolean;
  /** Shown in the catalog step's copy — saves the guide a second query. */
  itemCount: number;
}

/** Doc types whose expiry we track — the ones Compliance Watch can act on. */
const TRACKED_DOC_TYPES = DOC_TYPES.filter((t) => t.tracksExpiry).map((t) => t.value);

const filled = (v: string | null): boolean => Boolean(v && v.trim());

/** `count` from a head-only query, or 0 if the read failed (logged, not thrown). */
function countOf(label: string, res: { count: number | null; error: { message: string } | null }): number {
  if (res.error) {
    console.error(`[setup] ${label} count failed:`, res.error.message);
    return 0;
  }
  return res.count ?? 0;
}

export async function getSetupProgress(op: Operator): Promise<SetupProgress> {
  const supabase = createClient();
  const [items, docs, inquiries] = await Promise.all([
    supabase.from("items").select("id", { count: "exact", head: true }).eq("operator_id", op.id),
    // Only a tracked type WITH an expiry date counts — an undated COI leaves the
    // reminder lane just as inert as an empty drawer, which is the whole point.
    supabase
      .from("documents")
      .select("id", { count: "exact", head: true })
      .eq("operator_id", op.id)
      .in("type", TRACKED_DOC_TYPES)
      .not("expires_at", "is", null),
    supabase.from("inquiries").select("id", { count: "exact", head: true }).eq("operator_id", op.id),
  ]);

  const itemCount = countOf("items", items);
  const docCount = countOf("documents", docs);
  const inquiryCount = countOf("inquiries", inquiries);

  const steps: SetupStep[] = [
    { key: "location", done: filled(op.location) },
    { key: "items", done: itemCount > 0 },
    { key: "payments", done: op.connectChargesEnabled },
    { key: "documents", done: docCount > 0 },
    // Free plans can't turn follow-ups on at all, so the step is omitted rather
    // than parked forever undone — the Agents page does the upselling.
    ...(planCapabilities(op).followUpAgents
      ? [{ key: "followUps" as const, done: op.remindBalance || op.remindQuote || op.remindContract }]
      : []),
    { key: "policies", done: filled(op.cancellationPolicy) && filled(op.damagePolicy) },
    { key: "branding", done: filled(op.logoUrl) },
    { key: "voice", done: filled(op.assistantInstructions) },
    { key: "testDrive", done: inquiryCount > 0 },
  ];

  const doneCount = steps.filter((s) => s.done).length;
  return {
    steps,
    doneCount,
    total: steps.length,
    complete: doneCount === steps.length,
    dismissed: Boolean(op.setupDismissedAt),
    itemCount,
  };
}
