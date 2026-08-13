import { NextResponse } from "next/server";
import { getSmsProvider, smsEnabled } from "@/lib/sms";
import { claimWebhookEvent } from "@/lib/orders/repo";
import { findLatestInquiryByPhone, findLatestInquiryByIdentity } from "@/lib/inquiries/repo";
import { ingestInbound } from "@/lib/inquiries/ingest";
import { publicUrl } from "@/lib/urls";

export const dynamic = "force-dynamic";
// The AI turn makes a Claude call — give it headroom.
export const maxDuration = 60;

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
 * Inbound SMS webhook (Twilio). Shared-number model: route the text to the
 * customer's inquiry by phone, then hand the message to the shared ingest
 * pipeline (owner gate / burst-notify / AI turn — see lib/inquiries/ingest).
 * Always acks 200 so Twilio doesn't retry (idempotency is by MessageSid
 * regardless).
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
    let inquiry = await findLatestInquiryByPhone(from);
    // Identity fallback (inbox-plan Phase 2): the phone is known to the CRM
    // (e.g. captured at booking checkout) but was never denormalized onto an
    // inquiry — route to that customer's newest thread. True cold-start on the
    // shared number still drops; per-operator numbers are the Phase 4 fix.
    if (!inquiry) inquiry = await findLatestInquiryByIdentity("sms", from);
    if (!inquiry) return twiml();

    const result = await ingestInbound({ inquiry, text, channel: "sms", customerLabel: from });
    if (result.kind === "silent") return twiml(); // human-owned: saved, no auto-reply

    let reply = result.reply;
    // Delivery decoration, deliberately channel-side and not persisted: a ready
    // quote isn't self-serve over SMS — point them to the storefront.
    if (result.status === "quoted" && result.operator?.slug) {
      reply += `\n\nReserve online: ${publicUrl(`/s/${result.operator.slug}`)}`;
    }
    return twiml(reply);
  } catch (err) {
    // The inbound message is already saved; ack 200 (no retry) and let the
    // operator follow up. Claim stays so a retry wouldn't double-append.
    console.error("[sms] inbound handler failed:", err);
    return twiml();
  }
}
