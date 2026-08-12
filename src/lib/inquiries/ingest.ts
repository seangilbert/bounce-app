import {
  recordCustomerInbound,
  appendInquiryMessage,
  listMessagesByInquiry,
  setInquiryStatus,
  type InquiryRow,
} from "@/lib/inquiries/repo";
import { toApiMessages } from "@/lib/inquiries/thread";
import { handleInquiry } from "@/lib/llm/assistant";
import { getOperatorById } from "@/lib/inventory/repo";
import { notifyOperatorNewInquiry } from "@/lib/email";
import { appUrl } from "@/lib/urls";
import type { Operator } from "@/lib/inventory/types";

/**
 * The channel-agnostic inbound pipeline (inbox-plan §1): owner gate →
 * burst-notify → AI turn → persist → escalate/auto. Extracted from the Twilio
 * webhook so every channel (SMS, email, later Meta) shares one set of handoff
 * semantics instead of drifting copies.
 *
 * The caller has already verified the delivery, deduped it, and resolved the
 * inquiry; it delivers the returned reply on its own channel (TwiML for SMS,
 * an email send for inbound email). Return-based rather than callback-based
 * because SMS "delivery" IS the webhook's HTTP response.
 */
export type IngestResult =
  | { kind: "silent" } // human/needs_human gate: message saved, burst-notify maybe sent
  | {
      kind: "reply"; // AI ran: message + reply persisted, status/notifications handled
      reply: string;
      status: "gathering" | "quoted" | "review";
      operator: Operator | null; // already fetched — lets the route decorate/deliver
    };

export async function ingestInbound(opts: {
  inquiry: InquiryRow;
  text: string;
  /** Per-message channel: "sms" | "email" | ... */
  channel: string;
  /** Notification fallback when customer_name is null (phone number / from address). */
  customerLabel: string;
}): Promise<IngestResult> {
  const { inquiry, text, channel } = opts;

  // ── Handoff gate (inbox-plan Phase 0): a human owns this thread. ──
  // Save the message so it shows in the operator's inbox, stay silent (no AI
  // call, no auto-reply — the escalation ack was already sent when the thread
  // escalated). Notify the operator only on the FIRST inbound since their
  // last activity — one email per customer reply burst, not per message
  // (replying or taking over resets last_human_at, re-arming the notify).
  if (inquiry.owner !== "ai") {
    const firstOfBurst =
      inquiry.owner === "human" &&
      (!inquiry.last_customer_at ||
        (inquiry.last_human_at && inquiry.last_customer_at < inquiry.last_human_at));
    await recordCustomerInbound(inquiry.id, text, channel);
    if (firstOfBurst) {
      const op = await getOperatorById(inquiry.operator_id);
      if (op?.contactEmail && op.notifyNewInquiry) {
        try {
          await notifyOperatorNewInquiry({
            to: op.contactEmail,
            businessName: op.name,
            customer: inquiry.customer_name ?? opts.customerLabel,
            message: text,
            link: appUrl("/inquiries"),
          });
        } catch (e) {
          console.error("[ingest] operator alert failed:", e);
        }
      }
    }
    return { kind: "silent" };
  }

  // ── AI-owned: run the same brain as the web chat. ──
  // Append around the call (not persistTurn) so a thrown AI turn still keeps
  // the customer's inbound message in the thread.
  await recordCustomerInbound(inquiry.id, text, channel);

  const thread = (await listMessagesByInquiry([inquiry.id])).get(inquiry.id) ?? [];
  const messages = toApiMessages(thread);
  const result = await handleInquiry({
    operatorId: inquiry.operator_id,
    inquiryId: inquiry.id,
    messages,
    startDate: inquiry.start_date,
    endDate: inquiry.end_date,
  });

  await appendInquiryMessage(inquiry.id, "ai", result.reply, { channel, direction: "outbound" });

  const operator = await getOperatorById(inquiry.operator_id);
  if (result.status === "review") {
    // Escalated — handleInquiry already flipped status + owner to needs-human
    // (markInquiryNeedsHuman); we just alert the operator here.
    if (operator?.contactEmail && operator.notifyNewInquiry) {
      try {
        await notifyOperatorNewInquiry({
          to: operator.contactEmail,
          businessName: operator.name,
          customer: inquiry.customer_name ?? opts.customerLabel,
          message: text,
          link: appUrl("/inquiries"),
        });
      } catch (e) {
        console.error("[ingest] operator alert failed:", e);
      }
    }
  } else {
    await setInquiryStatus(inquiry.id, "auto");
  }

  return { kind: "reply", reply: result.reply, status: result.status, operator };
}
