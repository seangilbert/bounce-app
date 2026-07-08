"use server";

import { revalidatePath } from "next/cache";
import { getSessionOperator } from "@/lib/operator/session";
import { replyToInquiry, dismissInquiry } from "@/lib/inquiries/repo";
import { notifyInquiryReply } from "@/lib/email";
import { sendSms } from "@/lib/sms";

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
