import type { ThreadMessage } from "@/lib/inquiries/repo";

/**
 * Collapse an inquiry thread into an Anthropic-valid message array: customer →
 * `user`, ai/operator → `assistant`, consecutive same-role merged, leading
 * assistant turns dropped so it starts with `user`, capped to the recent tail.
 *
 * Pure — shared by the Twilio webhook (SMS AI loop) and the operator copilot
 * draft, so both feed the model the same conversation shape.
 */
export function toApiMessages(
  thread: ThreadMessage[],
): { role: "user" | "assistant"; content: string }[] {
  const mapped = thread
    .filter((m) => m.body.trim())
    .map((m) => ({
      role: m.sender === "customer" ? ("user" as const) : ("assistant" as const),
      content: m.body,
    }));
  const merged: { role: "user" | "assistant"; content: string }[] = [];
  for (const m of mapped) {
    const last = merged[merged.length - 1];
    if (last && last.role === m.role) last.content += "\n" + m.content;
    else merged.push({ ...m });
  }
  let out = merged.slice(-30);
  while (out.length && out[0]!.role !== "user") out = out.slice(1);
  return out;
}
