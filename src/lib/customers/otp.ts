import * as Sentry from "@sentry/nextjs";
import { createAdminClient } from "@/utils/supabase/admin";
import { sendEmail } from "@/lib/email/send";
import { loginCodeEmail } from "@/lib/email/login-code";
import { ensureCustomerAccount, normalizeEmail } from "./accounts";

/**
 * Passwordless sign-in for renters: we email a code, they type it back.
 *
 * Why not Supabase's own magic-link mailer? Its built-in SMTP is rate-limited to
 * a trickle and sends unbranded mail from a Supabase address. And a *link*
 * breaks on mobile, where tapping it in a mail app opens a different browser
 * than the one they started in, losing the session. A code works from any
 * device. So we mint the OTP with the admin API but deliver it over Resend,
 * which already sends every other customer-facing email in the app.
 */

/**
 * What actually happened. The caller MUST NOT leak this to the client — see the
 * note on the route. It exists so the server can log, alert, and be tested.
 */
export type LoginCodeOutcome =
  | "sent" // code minted + emailed (to a new or an existing account)
  | "mint_failed" // Supabase wouldn't issue an OTP
  | "delivery_failed"; // Resend wouldn't take it

/**
 * Sign in, or sign up — the same call, deliberately.
 *
 * This used to refuse any email that hadn't already rented ("you get an account
 * by renting, not by asking"), so the portal was sign-in only. It's now open:
 * anyone can create an account to save items before they ever book. The flow is
 * identical either way — entering the emailed code both proves the address and
 * creates the account — so the caller never has to know which it was, and we
 * never render a "no such account" dead end.
 *
 * Two things that gate changed, worth being explicit about:
 *
 *  - It was the enumeration guard. That no longer matters: when anyone can
 *    create an account, "does this email have one?" isn't a secret. The uniform
 *    200 stays regardless — it costs nothing and keeps the outcome private.
 *
 *  - It was also the anti-mailbomb guard: we only ever emailed people who had
 *    rented. Now any address can be sent a code, so the per-IP AND per-email
 *    rate limits on the route are the only thing standing between us and being
 *    used to spam a stranger's inbox. They are load-bearing now — do not relax
 *    them. (If this is ever abused in the wild, a CAPTCHA on the request form is
 *    the next lever.)
 */
export async function requestLoginCode(rawEmail: string): Promise<LoginCodeOutcome> {
  const email = normalizeEmail(rawEmail);

  const account = await ensureCustomerAccount(email);
  if (!account.ok) return "mint_failed";

  const code = await mintLoginCode(email);
  if (!code.ok) return "mint_failed";

  const sent = await sendEmail(loginCodeEmail(email, code.code));
  if (!sent.ok) {
    // Loud on OUR side, silent on the wire.
    //
    // The tempting thing is to return an error to the client ("we couldn't send
    // the code") so they aren't left waiting. That would be a mistake: a send
    // failure only happens for an email that EXISTS (we don't send otherwise),
    // so surfacing it turns this endpoint into an oracle — 502 means "this
    // person has rented", 200 means "they haven't".
    //
    // And it wouldn't be a rare leak. The likeliest prod misconfiguration is an
    // unverified RESEND_FROM domain, which fails EVERY send — leaving a
    // permanent, trivially-scriptable enumeration oracle. So the failure goes to
    // Sentry, where it's actionable, and the caller sees the same reply either
    // way. The customer's recourse is the resend button.
    Sentry.captureMessage("Customer login code could not be delivered", {
      level: "error",
      tags: { area: "customer-auth", skipped: String(sent.skipped ?? false) },
    });
    console.error("[customer-auth] login code email failed", { skipped: sent.skipped });
    return "delivery_failed";
  }
  return "sent";
}

/**
 * Ask Supabase Auth for a one-time code for this (existing) user.
 *
 * `generateLink` mints the token without mailing anything — exactly what we
 * want, since we do the mailing. It returns both a link and an `email_otp`; we
 * use only the code. Verification is client-side via `verifyOtp`, whose `type`
 * must match the one used here ("magiclink").
 *
 * Note the code's LENGTH is a GoTrue project setting, not a constant — this
 * project mints 8 digits, not the documented 6. Never hardcode it.
 */
async function mintLoginCode(
  email: string,
): Promise<{ ok: true; code: string } | { ok: false }> {
  const { data, error } = await createAdminClient().auth.admin.generateLink({
    type: "magiclink",
    email,
  });
  const code = data?.properties?.email_otp;
  if (error || !code) {
    Sentry.captureMessage("Customer login code could not be minted", {
      level: "error",
      tags: { area: "customer-auth" },
    });
    console.error("[customer-auth] generateLink failed:", error);
    return { ok: false };
  }
  return { ok: true, code };
}
