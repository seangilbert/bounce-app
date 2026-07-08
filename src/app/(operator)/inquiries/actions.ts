"use server";

import { revalidatePath } from "next/cache";
import { getSessionOperator } from "@/lib/operator/session";
import { replyToInquiry, dismissInquiry, setInquiryPhoneChannel } from "@/lib/inquiries/repo";
import { notifyInquiryReply } from "@/lib/email";
import { sendSms, smsEnabled } from "@/lib/sms";

export type ActionResult = { ok: true } | { ok: false; error: string };

export async function replyInquiryAction(id: string, reply: string): Promise<ActionResult> {
  const op = await getSessionOperator();
  if (!op) return { ok: false, error: "Not signed in." };
  const text = (reply ?? "").trim();
  if (!text) return { ok: false, error: "Write a reply first." };
  try {
    const inq = await replyToInquiry(op.id, id, text);
    // Deliver on the channel the customer used: SMS when it's a text thread with
    // a phone on file, otherwise email.
    if (inq?.channel === "sms" && inq.customerPhone) {
      await sendSms(inq.customerPhone, text);
    } else if (inq?.customerEmail) {
      try {
        await notifyInquiryReply({
          to: inq.customerEmail,
          businessName: op.name,
          operatorEmail: op.contactEmail,
          reply: text,
          original: inq.inboundMessage,
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
