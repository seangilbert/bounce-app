/**
 * Minimal Resend transport (REST, no SDK dependency). All sends are best-effort:
 * if RESEND_API_KEY isn't set, or the API errors, we log and move on — email
 * must never block a payment, inquiry, or reply.
 *
 * FROM: set RESEND_FROM to a verified-domain sender for real delivery. The
 * default (onboarding@resend.dev) is Resend's test sender and only delivers to
 * the Resend account owner's address.
 */
export interface EmailInput {
  to: string | string[];
  subject: string;
  html: string;
  replyTo?: string;
}

export async function sendEmail(input: EmailInput): Promise<{ ok: boolean; skipped?: boolean }> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM ?? "Movables <onboarding@resend.dev>";
  if (!key) {
    console.warn(`[email] RESEND_API_KEY not set — skipping "${input.subject}"`);
    return { ok: false, skipped: true };
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to: Array.isArray(input.to) ? input.to : [input.to],
        subject: input.subject,
        html: input.html,
        ...(input.replyTo ? { reply_to: input.replyTo } : {}),
      }),
    });
    if (!res.ok) {
      console.error(`[email] send failed (${res.status}):`, await res.text());
      return { ok: false };
    }
    return { ok: true };
  } catch (err) {
    console.error("[email] send error:", err);
    return { ok: false };
  }
}
