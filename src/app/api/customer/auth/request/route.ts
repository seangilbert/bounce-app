import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { checkRateLimit } from "@/lib/rate-limit";
import { requestLoginCode } from "@/lib/customers/otp";
import { normalizeEmail } from "@/lib/customers/accounts";

export const dynamic = "force-dynamic";

const Body = z.object({ email: z.string().trim().email().max(200) });

function clientIp(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}

/**
 * Email a renter a one-time sign-in code.
 *
 * Public + unauthenticated by necessity — it's the front door. Two abuse
 * surfaces, both handled:
 *
 *  - Enumeration: the response is identical whether or not the email has ever
 *    rented (see requestLoginCode). Callers cannot learn who has an account.
 *  - Mailbombing: rate-limited per-IP AND per-email, so neither "one attacker
 *    spraying many addresses" nor "many IPs hammering one victim's inbox" works.
 */
export async function POST(req: NextRequest) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }
  const email = normalizeEmail(parsed.data.email);

  const perIp = await checkRateLimit(`cust-otp-ip:${clientIp(req)}`, 8, 15 * 60_000);
  if (!perIp.allowed) {
    return NextResponse.json({ error: "Too many attempts. Try again shortly." }, { status: 429 });
  }
  // Keyed on the victim's address, not the requester's — this is the one that
  // stops someone else's inbox being used as a weapon.
  const perEmail = await checkRateLimit(`cust-otp-email:${email}`, 5, 15 * 60_000);
  if (!perEmail.allowed) {
    return NextResponse.json({ error: "Too many attempts. Try again shortly." }, { status: 429 });
  }

  // Deliberately discarded. Every outcome — code sent, no such customer, Resend
  // down — returns the SAME 200, because any difference is an oracle: it would
  // let anyone test whether a given person has rented. Failures are reported to
  // Sentry (see requestLoginCode), which is where we can act on them; the
  // customer's recourse is the resend button.
  await requestLoginCode(email);

  return NextResponse.json({ ok: true });
}
