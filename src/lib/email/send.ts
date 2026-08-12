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
  /** Customer-facing sends set this to the operator's business name so the
   *  inbox shows "<Business> via Movables" instead of bare "Movables".
   *  The ADDRESS never changes (it must stay on the verified domain) — only
   *  the display name. Operator alerts / platform emails leave it unset. */
  fromName?: string;
}

/** Compose the From header: swap the display name on the configured sender —
 *  the customer sees the business they're renting from, not the platform.
 *  Pure + exported for tests. Falls back to the base sender when the name is
 *  empty after sanitizing or the base has no extractable address. */
export function fromHeader(base: string, fromName?: string): string {
  const name = fromName?.replace(/["<>\r\n]/g, "").trim();
  if (!name) return base;
  const addr = base.match(/<([^<>\s]+@[^<>\s]+)>/)?.[1] ?? base.match(/^([^<>\s]+@[^<>\s]+)$/)?.[1];
  if (!addr) return base;
  return `"${name}" <${addr}>`;
}

export async function sendEmail(input: EmailInput): Promise<{ ok: boolean; skipped?: boolean }> {
  const key = process.env.RESEND_API_KEY;
  const from = fromHeader(
    process.env.RESEND_FROM ?? "Movables <onboarding@resend.dev>",
    input.fromName,
  );
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
