import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Resend inbound-email webhook: svix-style signature verification (hand-rolled
 * to match the house pattern in signwell.ts / sms/twilio.ts — no svix dep) and
 * the follow-up fetch for the full message body, which the webhook payload
 * deliberately omits (it carries metadata only).
 */

export interface ResendInboundEvent {
  type: string; // e.g. "email.received"
  data: {
    email_id: string;
    from: string;
    to?: string[];
    cc?: string[];
    bcc?: string[];
    /** Envelope recipients — set when the mail reached us via alias/forward. */
    received_for?: string[];
    subject?: string;
    message_id?: string;
  };
}

/** Reject deliveries older/newer than this (svix replay window). */
const TOLERANCE_SECONDS = 300;

/**
 * Verify a Resend webhook delivery (svix scheme): HMAC-SHA256 over
 * `${svix-id}.${svix-timestamp}.${rawBody}` keyed by the base64-decoded
 * `whsec_` secret, base64 digest, compared against the (possibly multiple,
 * space-delimited) `v1,<sig>` entries in `svix-signature`.
 * Throws on any failure; returns the parsed payload on success.
 */
export function verifyResendWebhook(
  rawBody: string,
  headers: Headers,
  nowMs: number = Date.now(),
): ResendInboundEvent {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) throw new Error("RESEND_WEBHOOK_SECRET is not set.");

  const id = headers.get("svix-id");
  const ts = headers.get("svix-timestamp");
  const sigHeader = headers.get("svix-signature");
  if (!id || !ts || !sigHeader) throw new Error("Missing svix signature headers.");

  const tsSec = Number(ts);
  if (!Number.isFinite(tsSec) || Math.abs(nowMs / 1000 - tsSec) > TOLERANCE_SECONDS) {
    throw new Error("Webhook timestamp outside tolerance.");
  }

  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const expected = Buffer.from(
    createHmac("sha256", key).update(`${id}.${ts}.${rawBody}`).digest("base64"),
  );

  // Multiple space-delimited "v1,<base64>" entries appear during key rotation.
  const ok = sigHeader.split(" ").some((part) => {
    if (!part.startsWith("v1,")) return false;
    const sig = Buffer.from(part.slice(3));
    return sig.length === expected.length && timingSafeEqual(sig, expected);
  });
  if (!ok) throw new Error("Resend webhook signature mismatch.");

  return JSON.parse(rawBody) as ResendInboundEvent;
}

export interface InboundEmailBody {
  from: string;
  subject: string | null;
  text: string | null;
  html: string | null;
  headers: Record<string, string>;
}

/**
 * Fetch the full inbound message (body + headers) the webhook only announced.
 * Returns null on any failure — the caller decides whether to 500 for a
 * provider retry. Raw fetch to match send.ts (no Resend SDK in this repo).
 */
export async function fetchInboundEmail(emailId: string): Promise<InboundEmailBody | null> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.warn("[email-inbound] RESEND_API_KEY missing; cannot fetch message body.");
    return null;
  }
  try {
    const res = await fetch(`https://api.resend.com/emails/receiving/${emailId}`, {
      headers: { Authorization: `Bearer ${key}` },
    });
    if (!res.ok) {
      console.error(`[email-inbound] body fetch failed (${res.status}):`, await res.text());
      return null;
    }
    const data = (await res.json()) as Partial<InboundEmailBody> & { from?: string };
    if (!data.from) return null;
    return {
      from: data.from,
      subject: data.subject ?? null,
      text: data.text ?? null,
      html: data.html ?? null,
      headers: (data.headers as Record<string, string>) ?? {},
    };
  } catch (err) {
    console.error("[email-inbound] body fetch threw:", err);
    return null;
  }
}
