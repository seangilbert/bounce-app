import { NextResponse } from "next/server";
import { getSmsProvider, smsEnabled } from "@/lib/sms";
import { claimWebhookEvent } from "@/lib/orders/repo";
import {
  findLatestInquiryByPhone,
  appendInquiryMessage,
  listMessagesByInquiry,
  setInquiryStatus,
  type ThreadMessage,
} from "@/lib/inquiries/repo";
import { handleInquiry } from "@/lib/llm/assistant";
import { getOperatorById } from "@/lib/inventory/repo";
import { notifyOperatorNewInquiry } from "@/lib/email";

export const dynamic = "force-dynamic";
// The AI turn makes a Claude call — give it headroom.
export const maxDuration = 60;

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://bounce-app.vercel.app";

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** A Twilio reply: `<Message>` is delivered to the sender; empty = ack, no reply. */
function twiml(message?: string): Response {
  const inner = message ? `<Message>${escapeXml(message)}</Message>` : "";
  return new Response(`<?xml version="1.0" encoding="UTF-8"?><Response>${inner}</Response>`, {
    status: 200,
    headers: { "Content-Type": "text/xml" },
  });
}

/**
 * Collapse the inquiry thread into an Anthropic-valid message array: customer →
 * `user`, ai/operator → `assistant`, consecutive same-role merged, leading
 * assistant turns dropped so it starts with `user`, capped to the recent tail.
 */
function toApiMessages(thread: ThreadMessage[]): { role: "user" | "assistant"; content: string }[] {
  const mapped = thread
    .filter((m) => m.body.trim())
    .map((m) => ({ role: m.sender === "customer" ? ("user" as const) : ("assistant" as const), content: m.body }));
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

/**
 * Inbound SMS webhook (Twilio). Shared-number, full-AI-loop model: route the text
 * to the customer's inquiry by phone, append it to the thread, run the same AI
 * brain as the web chat, reply over SMS, and escalate to the operator when the
 * quote needs review. Always acks 200 so Twilio doesn't retry (idempotency is by
 * MessageSid regardless).
 */
export async function POST(req: Request) {
  if (!smsEnabled()) return twiml(); // Twilio not configured — nothing to do.

  const rawBody = await req.text();
  // Twilio signs the exact URL it POSTs to; an explicit override is most reliable
  // behind proxies/rewrites.
  const proto = req.headers.get("x-forwarded-proto") ?? "https";
  const host = req.headers.get("host") ?? "";
  const url = process.env.TWILIO_WEBHOOK_URL ?? `${proto}://${host}${new URL(req.url).pathname}`;

  let inbound;
  try {
    inbound = await getSmsProvider().verifyWebhook(rawBody, req.headers, url);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "signature verification failed" },
      { status: 403 },
    );
  }

  const from = inbound.from.trim();
  const text = inbound.body.trim();
  if (!from || !text) return twiml();

  // Idempotency: a Twilio retry carries the same MessageSid.
  let claimed: boolean;
  try {
    claimed = await claimWebhookEvent("twilio", inbound.messageSid);
  } catch {
    // Storage down — 500 so Twilio retries rather than dropping the message.
    return NextResponse.json({ error: "claim failed" }, { status: 500 });
  }
  if (!claimed) return twiml();

  try {
    const inquiry = await findLatestInquiryByPhone(from);
    // Unknown sender on the shared number — no thread to route to. (Cold inbound
    // needs per-operator numbers; that's a follow-up.)
    if (!inquiry) return twiml();

    await appendInquiryMessage(inquiry.id, "customer", text);

    const thread = (await listMessagesByInquiry([inquiry.id])).get(inquiry.id) ?? [];
    const messages = toApiMessages(thread);
    const result = await handleInquiry({
      operatorId: inquiry.operator_id,
      inquiryId: inquiry.id,
      messages,
      startDate: inquiry.start_date,
      endDate: inquiry.end_date,
    });

    await appendInquiryMessage(inquiry.id, "ai", result.reply);

    const operator = await getOperatorById(inquiry.operator_id);
    let reply = result.reply;
    if (result.status === "review") {
      // Over the auto-quote cap / unmatched items — hand to the operator.
      await setInquiryStatus(inquiry.id, "needs_review");
      if (operator?.contactEmail && operator.notifyNewInquiry) {
        try {
          await notifyOperatorNewInquiry({
            to: operator.contactEmail,
            businessName: operator.name,
            customer: inquiry.customer_name ?? from,
            message: text,
            link: `${APP_URL}/inquiries`,
          });
        } catch (e) {
          console.error("[sms] operator alert failed:", e);
        }
      }
    } else {
      await setInquiryStatus(inquiry.id, "auto");
      // A ready quote isn't self-serve over SMS — point them to the storefront.
      if (result.status === "quoted" && operator?.slug) {
        reply += `\n\nReserve online: ${APP_URL}/s/${operator.slug}`;
      }
    }

    return twiml(reply);
  } catch (err) {
    // The inbound message is already saved; ack 200 (no retry) and let the
    // operator follow up. Claim stays so a retry wouldn't double-append.
    console.error("[sms] inbound handler failed:", err);
    return twiml();
  }
}
