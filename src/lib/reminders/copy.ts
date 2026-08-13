import type { ReminderFacts, ReminderKind } from "@/lib/llm/assistant";

/**
 * Deterministic reminder intros — the fallback when the AI drafter throws
 * (refusal, empty output, safety check, API outage). A reminder must always
 * be sendable; this is the floor it can't fall below.
 */
export function fallbackReminderIntro(
  kind: ReminderKind,
  operatorName: string,
  facts: ReminderFacts,
): string {
  const hi = `Hi ${facts.customerFirstName ?? "there"}`;
  if (kind === "balance") {
    return `${hi} — a friendly reminder from ${operatorName}: your rental for ${facts.eventDateLabel} has a remaining balance${
      facts.balanceLabel ? ` of ${facts.balanceLabel}` : ""
    }. You can take care of it online below in about a minute.`;
  }
  if (kind === "quote") {
    return `${hi} — just checking in from ${operatorName}. Your quote for ${facts.eventDateLabel} is still available, and you can review it and reserve online below whenever you're ready.`;
  }
  return `${hi} — your rental agreement for ${facts.eventDateLabel} from ${operatorName} is still waiting for your signature.`;
}
