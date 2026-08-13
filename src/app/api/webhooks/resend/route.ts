import { NextResponse } from "next/server";
import { claimWebhookEvent, releaseWebhookEvent } from "@/lib/orders/repo";
import { verifyResendWebhook, fetchInboundEmail } from "@/lib/email/resend-webhook";
import {
  inboundEmailEnabled,
  findInquiryIdInRecipients,
  parseEmailAddress,
  isAutoResponder,
  extractReplyText,
} from "@/lib/email/inbound";
import {
  getInquiryById,
  setInquiryContact,
  findLatestInquiryByIdentity,
} from "@/lib/inquiries/repo";
import { ingestInbound } from "@/lib/inquiries/ingest";
import { sendEmail, buildAiInquiryReplyEmail } from "@/lib/email";
import { publicUrl } from "@/lib/urls";

export const dynamic = "force-dynamic";
// The AI turn makes a Claude call — give it headroom.
export const maxDuration = 60;

const ok = (extra: Record<string, unknown> = {}) => NextResponse.json({ received: true, ...extra });

/**
 * Inbound email webhook (Resend, inbox-plan Phase 1). Customer replies to a
 * plus-addressed Reply-To (`reply+<inquiryId>@<inbound domain>`) land here:
 * verify → dedupe → fetch the full body (the webhook is metadata-only) →
 * guards (auto-responder, sender verification) → strip the quoted chain →
 * shared ingest (owner gate / burst-notify / AI turn) → email the AI's reply
 * back on the same loop.
 *
 * Deliberate deviations from SMS, documented here:
 *  - Dismissed threads still ingest — routing is by exact inquiry id, and a
 *    customer replying to a real quote email must never be dropped (the
 *    ingest's status writes naturally reopen it).
 *  - A `review` outcome still emails the reply — it's the graceful escalation
 *    ack, same as the SMS branch.
 */
export async function POST(req: Request) {
  // Feature-gated: without the inbound env, acknowledge and do nothing.
  if (!inboundEmailEnabled()) return ok({ skipped: true });

  const rawBody = await req.text();
  let event;
  try {
    event = verifyResendWebhook(rawBody, req.headers);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "signature verification failed" },
      { status: 403 },
    );
  }

  if (event.type !== "email.received") return ok({ ignored: event.type });
  const emailId = event.data.email_id;
  if (!emailId) return ok({ ignored: "no email_id" });

  // Idempotency: Resend retries carry the same email_id.
  let claimed: boolean;
  try {
    claimed = await claimWebhookEvent("resend", emailId);
  } catch {
    // Storage down — 500 so Resend retries rather than dropping the message.
    return NextResponse.json({ error: "claim failed" }, { status: 500 });
  }
  if (!claimed) return ok({ duplicate: true });

  try {
    // Route by the plus address. Envelope recipients first — a reply that
    // reached us via an alias/forward may not show our address in `to`.
    const inquiryId = findInquiryIdInRecipients([
      ...(event.data.received_for ?? []),
      ...(event.data.to ?? []),
      ...(event.data.cc ?? []),
    ]);
    let inquiry = inquiryId ? await getInquiryById(inquiryId) : null;
    // Identity fallback (inbox-plan Phase 2): plus address missing/mangled or
    // pointing at a vanished row — route by the sender's known identity. The
    // identity IS the sender, so this path arrives pre-verified.
    let routedByIdentity = false;
    if (!inquiry) {
      const envelopeSender = parseEmailAddress(event.data.from ?? "");
      if (envelopeSender) {
        inquiry = await findLatestInquiryByIdentity("email", envelopeSender.email);
        routedByIdentity = !!inquiry;
      }
      if (!inquiry) {
        console.warn(
          "[email-inbound] unroutable (no reply+<id>, no identity):",
          event.data.to,
          event.data.from,
        );
        return ok({ ignored: "unroutable" });
      }
    }

    // The webhook is metadata-only; the body lives behind a second call. A
    // transient fetch failure releases the claim so Resend's retry re-processes
    // instead of being deduped away.
    const body = await fetchInboundEmail(emailId);
    if (!body) {
      try {
        await releaseWebhookEvent("resend", emailId);
      } catch (e) {
        console.error("[email-inbound] claim release failed:", e);
      }
      return NextResponse.json({ error: "body fetch failed" }, { status: 500 });
    }

    // Never feed bounces/auto-replies to the AI (auto-responder loop guard).
    if (isAutoResponder(body.headers, body.from)) return ok({ ignored: "auto-responder" });

    // Sender verification: the plus-address uuid is a capability token; the
    // from-address match is the second factor. Unknown-contact threads adopt
    // the sender (fills-never-clears, via setInquiryContact).
    const sender = parseEmailAddress(body.from);
    if (!sender) return ok({ ignored: "unparseable sender" });
    if (inquiry.customer_email) {
      if (inquiry.customer_email.toLowerCase() !== sender.email && !routedByIdentity) {
        // Plus-addressed path: the uuid is a capability token and the
        // from-match is its second factor — a mismatch drops. Identity-routed
        // mail is exempt: we selected this thread BECAUSE the sender's
        // identity maps to its customer, so a differing customer_email just
        // means the customer has two known addresses.
        console.warn(
          `[email-inbound] sender mismatch for ${inquiry.id}: ${sender.email} != ${inquiry.customer_email}`,
        );
        return ok({ ignored: "sender mismatch" });
      }
    } else {
      try {
        await setInquiryContact(inquiry.operator_id, inquiry.id, {
          email: sender.email,
          name: sender.name,
        });
      } catch (e) {
        console.error("[email-inbound] contact adoption failed:", e);
      }
    }

    const text = extractReplyText(body.text, body.html);
    if (!text) return ok({ ignored: "empty body" });

    const result = await ingestInbound({
      inquiry,
      text,
      channel: "email",
      customerLabel: inquiry.customer_name ?? sender.email,
    });
    if (result.kind === "silent") return ok(); // human-owned: saved + burst-notified

    // Email the AI's reply back on the same loop. Best-effort (sendEmail never
    // throws) — the thread already holds the reply, matching the SMS posture.
    await sendEmail(
      buildAiInquiryReplyEmail({
        to: inquiry.customer_email ?? sender.email,
        businessName: result.operator?.name ?? "the team",
        reply: result.reply,
        inquiryId: inquiry.id,
        inboundSubject: body.subject,
        operatorEmail: result.operator?.contactEmail,
        reserveUrl:
          result.status === "quoted" && result.operator?.slug
            ? publicUrl(`/s/${result.operator.slug}`)
            : null,
      }),
    );
    return ok();
  } catch (err) {
    // The inbound message may already be saved; ack 200 (no retry) and let the
    // operator follow up. Claim stays so a retry wouldn't double-append.
    console.error("[email-inbound] handler failed:", err);
    return ok({ error: "handled" });
  }
}
