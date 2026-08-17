"use server";

import { revalidatePath } from "next/cache";
import { getSessionOperator } from "@/lib/operator/session";
import {
  replyToInquiry,
  dismissInquiry,
  setInquiryPhoneChannel,
  setInquiryOwnerAsOperator,
  getInquiryForOperator,
  listMessagesByInquiry,
} from "@/lib/inquiries/repo";
import { toApiMessages } from "@/lib/inquiries/thread";
import { draftOperatorReply } from "@/lib/llm/assistant";
import { checkRateLimit } from "@/lib/rate-limit";
import { notifyInquiryReply } from "@/lib/email";
import { sendSms, smsEnabled } from "@/lib/sms";
import { planCapabilities } from "@/lib/plans";

export type ActionResult = { ok: true } | { ok: false; error: string };

export async function replyInquiryAction(id: string, reply: string): Promise<ActionResult> {
  const op = await getSessionOperator();
  if (!op) return { ok: false, error: "Not signed in." };
  const text = (reply ?? "").trim();
  if (!text) return { ok: false, error: "Write a reply first." };
  try {
    // Plan gate on the SMS channel (per-message cost): a downgraded operator
    // with an existing text thread falls back to email delivery when the
    // customer left one — and is told up front (BEFORE anything persists) when
    // they didn't, rather than recording a reply the customer never receives.
    const smsAllowed = planCapabilities(op).smsChannel;
    if (!smsAllowed) {
      const existing = await getInquiryForOperator(op.id, id);
      if (existing?.channel === "sms" && !existing.customer_email) {
        return {
          ok: false,
          error: "This customer is on a text thread. Texting is a Solo plan feature — upgrade to reply by text.",
        };
      }
    }
    const inq = await replyToInquiry(op.id, id, text);
    // Deliver on the channel the customer used: SMS when it's a text thread with
    // a phone on file, otherwise email.
    if (inq?.channel === "sms" && inq.customerPhone && smsAllowed) {
      await sendSms(inq.customerPhone, text);
    } else if (inq?.customerEmail) {
      try {
        await notifyInquiryReply({
          to: inq.customerEmail,
          businessName: op.name,
          operatorEmail: op.contactEmail,
          reply: text,
          original: inq.inboundMessage,
          inquiryId: id, // plus-addressed Reply-To → the customer's reply routes back
        });
      } catch (err) {
        console.error("[inquiries] reply email failed:", err);
      }
    }
    revalidatePath("/inquiries");
    revalidatePath("/dashboard");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not send." };
  }
}

// Loose E.164 check: leading +, then 7–15 digits. Twilio wants E.164.
const PHONE_RE = /^\+[1-9]\d{6,14}$/;

/**
 * Start (or continue) an SMS thread with the customer: record the phone, switch
 * the inquiry to the `sms` channel, append the operator's message to the thread,
 * and text it. The customer's reply then routes back via /api/webhooks/twilio.
 */
export async function sendInquirySmsAction(
  id: string,
  phone: string,
  message: string,
): Promise<ActionResult> {
  const op = await getSessionOperator();
  if (!op) return { ok: false, error: "Not signed in." };
  if (!smsEnabled()) return { ok: false, error: "Texting isn't set up yet (Twilio not configured)." };
  if (!planCapabilities(op).smsChannel) {
    return { ok: false, error: "Texting customers is a Solo plan feature. Upgrade to start SMS threads." };
  }
  const text = (message ?? "").trim();
  if (!text) return { ok: false, error: "Write a message first." };
  const num = (phone ?? "").trim().replace(/[\s()-]/g, "");
  if (!PHONE_RE.test(num)) {
    return { ok: false, error: "Enter a valid phone in international format, e.g. +15085551234." };
  }
  try {
    const scoped = await setInquiryPhoneChannel(op.id, id, num);
    if (!scoped) return { ok: false, error: "Inquiry not found." };
    // Append the operator message + mark replied (records the thread history).
    await replyToInquiry(op.id, id, text);
    const sent = await sendSms(num, text);
    if (!sent) return { ok: false, error: "Couldn't send the text — check the number and try again." };
    revalidatePath("/inquiries");
    revalidatePath("/dashboard");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not send the text." };
  }
}

/** Take over: pause the AI on this thread — the operator owns replies until an
 *  explicit hand-back. (Sending a reply also takes over, via replyToInquiry.) */
export async function takeOverInquiryAction(id: string): Promise<ActionResult> {
  const op = await getSessionOperator();
  if (!op) return { ok: false, error: "Not signed in." };
  try {
    const found = await setInquiryOwnerAsOperator(op.id, id, "human");
    if (!found) return { ok: false, error: "Inquiry not found." };
    revalidatePath("/inquiries");
    revalidatePath("/dashboard");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not take over." };
  }
}

/** Hand back: the AI resumes auto-responding on this thread. */
export async function handBackInquiryAction(id: string): Promise<ActionResult> {
  const op = await getSessionOperator();
  if (!op) return { ok: false, error: "Not signed in." };
  try {
    const found = await setInquiryOwnerAsOperator(op.id, id, "ai");
    if (!found) return { ok: false, error: "Inquiry not found." };
    revalidatePath("/inquiries");
    revalidatePath("/dashboard");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not hand back." };
  }
}

export type DraftResult = { ok: true; draft: string } | { ok: false; error: string };

/**
 * AI-as-copilot (on demand): draft a reply the operator can edit and send. Not
 * metered against the monthly AI-quote cap — that cap targets customer-facing
 * auto-quoting spend, and capped Free operators are exactly the ones replying
 * by hand. Rate-limited per operator purely as a cost backstop.
 */
export async function draftReplyAction(id: string): Promise<DraftResult> {
  const op = await getSessionOperator();
  if (!op) return { ok: false, error: "Not signed in." };
  const rl = await checkRateLimit(`draft:${op.id}`, 10, 60_000);
  if (!rl.allowed) return { ok: false, error: "Too many drafts — try again in a minute." };
  try {
    const row = await getInquiryForOperator(op.id, id);
    if (!row) return { ok: false, error: "Inquiry not found." };
    const thread = (await listMessagesByInquiry([id])).get(id) ?? [];
    const messages = toApiMessages(thread);
    const draft = await draftOperatorReply(
      op.id,
      messages.length ? messages : [{ role: "user", content: row.inbound_message }],
      { startDate: row.start_date },
    );
    return { ok: true, draft };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not draft a reply." };
  }
}

export async function dismissInquiryAction(id: string): Promise<ActionResult> {
  const op = await getSessionOperator();
  if (!op) return { ok: false, error: "Not signed in." };
  try {
    await dismissInquiry(op.id, id);
    revalidatePath("/inquiries");
    revalidatePath("/dashboard");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not dismiss." };
  }
}
