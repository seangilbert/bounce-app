import { redirect } from "next/navigation";
import { getSessionMembership } from "@/lib/operator/session";
import { planCapabilities } from "@/lib/plans";
import { getAiQuoteUsage, getQuoteQuota } from "@/lib/usage/ai-quotes";
import { getAgentStats } from "@/lib/reminders/stats";
import { autoSendEnabled } from "@/lib/esign/agreements";
import { AgentsView } from "@/components/operator/agents/AgentsView";

export const dynamic = "force-dynamic";

export const metadata = { title: "Agents — Movables" };

export default async function AgentsPage() {
  const membership = await getSessionMembership();
  if (!membership) {
    return <div className="p-8 text-ink-mute">No operator linked to your account.</div>;
  }
  if (membership.role !== "admin") redirect("/dashboard");
  const op = membership.operator;

  // getQuoteQuota skips the usage read on unlimited plans (hot-path gating
  // optimization), so read the display count directly.
  const [stats, quota, aiUsed] = await Promise.all([
    getAgentStats(op.id),
    getQuoteQuota(op),
    getAiQuoteUsage(op.id),
  ]);

  return (
    <AgentsView
      followUpAgentsEnabled={planCapabilities(op).followUpAgents}
      toggles={{
        remindBalance: op.remindBalance,
        remindContract: op.remindContract,
        remindQuote: op.remindQuote,
        notifyDocExpiry: op.notifyDocExpiry,
      }}
      stats={stats}
      // Infinity doesn't survive the RSC boundary — null = unlimited.
      aiQuota={{ used: aiUsed, limit: Number.isFinite(quota.limit) ? quota.limit : null }}
      contractAutoSendLive={autoSendEnabled()}
      assistantInstructions={op.assistantInstructions}
    />
  );
}
