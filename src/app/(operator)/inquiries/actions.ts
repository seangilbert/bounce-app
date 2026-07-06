"use server";

import { revalidatePath } from "next/cache";
import { getSessionOperator } from "@/lib/operator/session";
import { replyToInquiry, dismissInquiry } from "@/lib/inquiries/repo";

export type ActionResult = { ok: true } | { ok: false; error: string };

export async function replyInquiryAction(id: string, reply: string): Promise<ActionResult> {
  const op = await getSessionOperator();
  if (!op) return { ok: false, error: "Not signed in." };
  const text = (reply ?? "").trim();
  if (!text) return { ok: false, error: "Write a reply first." };
  try {
    await replyToInquiry(op.id, id, text);
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
