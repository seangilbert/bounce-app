/**
 * Computes the `frame-ancestors` CSP for the /embed route from the API key's
 * registered origins — so an operator's storefront can only be framed on the
 * domains they allow-listed. Runs in Edge middleware, so it uses only Web Crypto
 * + fetch (no Node APIs, no supabase-js).
 */

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function frameAncestorsForKey(key: string | null): Promise<string> {
  // No key → not a real embed; block framing entirely.
  if (!key) return "frame-ancestors 'none'";

  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const svc = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !svc) return "frame-ancestors 'self'";

  try {
    const hash = await sha256Hex(key);
    const res = await fetch(
      `${url}/rest/v1/api_keys?key_hash=eq.${hash}&revoked_at=is.null&type=eq.publishable&select=allowed_origins`,
      { headers: { apikey: svc, Authorization: `Bearer ${svc}` } },
    );
    if (!res.ok) return "frame-ancestors 'none'";
    const rows = (await res.json()) as { allowed_origins?: string[] }[];
    // Unknown / revoked key → block framing entirely.
    if (!Array.isArray(rows) || rows.length === 0) return "frame-ancestors 'none'";
    const origins = rows[0].allowed_origins;
    if (!Array.isArray(origins) || origins.length === 0) {
      // Valid key but no registered origins yet → only we can frame it.
      return "frame-ancestors 'self'";
    }
    // CSP tokens are space-separated; drop anything containing whitespace.
    const safe = origins.filter((o) => typeof o === "string" && o.length > 0 && !/\s/.test(o));
    return `frame-ancestors 'self' ${safe.join(" ")}`;
  } catch {
    return "frame-ancestors 'self'";
  }
}
