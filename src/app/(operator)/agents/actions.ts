"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/operator/session";
import { planCapabilities } from "@/lib/plans";
import { createClient } from "@/utils/supabase/server";

export type ActionResult = { ok: true } | { ok: false; error: string };

/** Agent card toggles → operators columns. The three remind* agents are
 *  customer-facing and plan-gated (Solo+); Compliance Watch (notifyDocExpiry)
 *  is operator-facing and free on every tier. */
const AGENT_TOGGLE_COLUMNS = {
  remindBalance: "remind_balance",
  remindContract: "remind_contract",
  remindQuote: "remind_quote",
  notifyDocExpiry: "notify_doc_expiry",
} as const;

export type AgentToggleKey = keyof typeof AGENT_TOGGLE_COLUMNS;

const ToggleInput = z.object({
  key: z.enum(["remindBalance", "remindContract", "remindQuote", "notifyDocExpiry"]),
  enabled: z.boolean(),
});

export async function setAgentToggleAction(input: unknown): Promise<ActionResult> {
  const g = await requireAdmin();
  if (!g.ok) return { ok: false, error: g.error };
  const op = g.membership.operator;
  const p = ToggleInput.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "Invalid." };

  // Server-side plan gate — the UI disables gated switches, but the plan is
  // never trusted from the client. (The cron sweep re-checks on send, so even
  // a stale ON toggle after a downgrade sends nothing.)
  if (p.data.key !== "notifyDocExpiry" && !planCapabilities(op).followUpAgents) {
    return { ok: false, error: "Automated follow-ups are available on the Solo plan and up." };
  }

  const { error } = await createClient()
    .from("operators")
    .update({ [AGENT_TOGGLE_COLUMNS[p.data.key]]: p.data.enabled })
    .eq("id", op.id);
  if (error) return { ok: false, error: "Could not update the agent." };

  revalidatePath("/agents");
  revalidatePath("/settings"); // Notifications section shows notifyDocExpiry too
  return { ok: true };
}
