import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Exchanges the one-time `code` from an emailed auth link (password recovery,
 * and any future email confirmation) for a real session, then forwards the user
 * to wherever the link asked to go.
 *
 * This is the landing point set as `redirectTo` when we call
 * `resetPasswordForEmail` — the browser client that requested the reset stored a
 * PKCE code_verifier cookie, and `exchangeCodeForSession` pairs it with the
 * `code` here to mint the session cookies before the user reaches the form.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  // Only allow same-origin relative paths, so a crafted link can't bounce the
  // freshly-authenticated session off to an attacker's URL.
  const nextParam = searchParams.get("next") ?? "/reset-password";
  const next = nextParam.startsWith("/") && !nextParam.startsWith("//") ? nextParam : "/reset-password";

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent("This link is invalid or has expired.")}`);
  }

  const supabase = createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent("This link is invalid or has expired. Request a new one.")}`,
    );
  }

  // Behind Vercel's proxy the request origin is the internal host; the
  // user-facing host arrives in x-forwarded-host. Honour it in production so the
  // redirect lands on the real domain, not the proxy target.
  const forwardedHost = request.headers.get("x-forwarded-host");
  const isProd = process.env.NODE_ENV === "production";
  if (isProd && forwardedHost) {
    return NextResponse.redirect(`https://${forwardedHost}${next}`);
  }
  return NextResponse.redirect(`${origin}${next}`);
}
