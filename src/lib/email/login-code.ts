import type { EmailInput } from "./send";

/**
 * The renter's sign-in code.
 *
 * Kept out of `email/index.ts` on purpose: everything there is an OPERATOR-branded
 * notification ("Sent by {business}"), because it's about a booking with that
 * operator. This one is from the platform — a person may have rented from
 * several operators, and the account they're signing in to spans all of them.
 */
export function loginCodeEmail(to: string, code: string): EmailInput {
  return {
    to,
    subject: `${code} is your Bounce sign-in code`,
    html: `<!doctype html><html><body style="margin:0;padding:0;background:#FBF7F0;">
  <div style="max-width:480px;margin:0 auto;padding:28px 20px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#1A1A1A;">
    <div style="font-weight:800;font-size:18px;letter-spacing:-0.02em;">Bounce</div>
    <div style="background:#FFFFFF;border:1px solid #F1E8DE;border-radius:20px;padding:26px;margin-top:16px;text-align:center;">
      <h1 style="margin:0 0 8px;font-size:22px;font-weight:800;letter-spacing:-0.02em;">Your sign-in code</h1>
      <p style="margin:0 0 20px;font-size:15px;line-height:1.5;color:#463F38;">Enter this code to finish signing in.</p>
      <div style="font-size:34px;font-weight:800;letter-spacing:0.22em;color:#3B7DF0;padding:14px 0;background:#F6F9FF;border-radius:14px;">${code}</div>
      <p style="margin:20px 0 0;font-size:13px;line-height:1.5;color:#9A9186;">This code expires in about an hour. <strong>If you didn't ask for it, you can safely ignore this email</strong> — the code is the only way in, and without it nobody can sign in or see anything.</p>
    </div>
    <div style="color:#9A9186;font-size:12px;margin-top:16px;text-align:center;">Bounce · party rental bookings</div>
  </div></body></html>`,
  };
}
