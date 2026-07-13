/**
 * Clamp a `?next=` param to somewhere inside the renter portal.
 *
 * The login page takes a post-sign-in destination from the query string, which
 * is attacker-controllable — a crafted /my/login?next=https://evil.example link
 * would otherwise hand a freshly-signed-in customer straight to a phishing page
 * that looks like the one they just trusted.
 *
 * Anything that isn't clearly an in-portal path falls back to /my.
 */
export function safeNext(next?: string | null): string {
  if (!next) return "/my";
  // "//evil.example" is protocol-relative: the browser treats it as absolute,
  // but it passes a naive startsWith("/") check. Reject before anything else.
  if (next.startsWith("//")) return "/my";
  if (!next.startsWith("/my")) return "/my";
  // Guard against /myevil — only exactly /my or a path beneath it.
  if (next !== "/my" && !next.startsWith("/my/")) return "/my";
  return next;
}
