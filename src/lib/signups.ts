/**
 * Operator self-serve signup is gated while we're pre-launch.
 *
 * Fail-safe by default: **closed unless explicitly opened.** A missing or
 * malformed flag means closed, so a forgotten env var can never leave the door
 * open. Reopening is a single var — `NEXT_PUBLIC_SIGNUPS_OPEN=true` — which also
 * lets local dev keep testing signup (it's set in `.env.local`).
 *
 * The flag is `NEXT_PUBLIC_` so the same value gates the marketing CTAs, the
 * `/signup` page, AND the API route from one source. It's not a secret — whether
 * signups are open is public. The API check is the authoritative one; the CTA +
 * page changes are UX so nobody lands on a dead form.
 *
 * Note it's build-time inlined (like all `NEXT_PUBLIC_` vars), and the marketing
 * pages are statically prerendered — so flipping it in Vercel takes effect on
 * the next deploy, which changing an env var triggers anyway.
 */
export function signupsOpen(): boolean {
  return process.env.NEXT_PUBLIC_SIGNUPS_OPEN === "true";
}

/** Where an interested operator is pointed while signups are closed. */
export const EARLY_ACCESS_EMAIL = "hello@movables.ai";

export const earlyAccessHref = `mailto:${EARLY_ACCESS_EMAIL}?subject=${encodeURIComponent(
  "Early access to Movables",
)}`;
