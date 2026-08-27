import { createClient } from "@/utils/supabase/client";

/**
 * Browser-side sign-out that cannot strand the user.
 *
 * `auth.signOut()` awaits a round-trip to Supabase Auth, and when that service
 * is slow or down the promise just hangs — the button looks dead, nothing
 * navigates, and the session cookie survives (seen live 2026-08-27 when the
 * dev project's auth service stalled). So: race the real sign-out against a
 * short timeout, swallow failures, and then expire the `sb-*` auth cookies
 * ourselves regardless — they're client-readable by design with @supabase/ssr,
 * and clearing them is what actually ends the session as far as the server is
 * concerned. On the happy path signOut already cleared them and the sweep is a
 * no-op; on the unhappy path the sweep is the sign-out.
 *
 * Callers navigate afterwards; this never throws.
 */
export async function signOutResilient(): Promise<void> {
  try {
    await Promise.race([
      createClient().auth.signOut(),
      new Promise((resolve) => setTimeout(resolve, 4000)),
    ]);
  } catch {
    // Server revocation failed — local cleanup below still signs us out here.
  }
  for (const pair of document.cookie.split("; ")) {
    const name = pair.split("=")[0];
    if (name.startsWith("sb-")) document.cookie = `${name}=; path=/; max-age=0`;
  }
}
