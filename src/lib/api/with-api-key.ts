import { NextResponse } from "next/server";
import { resolveOperatorByKey, originAllowed, type ResolvedKey, type ApiKeyType } from "@/lib/api-keys/repo";
import { planCapabilities } from "@/lib/plans";
import { checkRateLimit } from "@/lib/rate-limit";

/**
 * Wraps a public `/api/v1` handler with per-operator API-key auth + CORS.
 *
 * The operator is resolved FROM the key, never from the request body, so a key
 * only ever acts on its own tenant. CORS is intentionally permissive at the
 * transport layer (we echo the request Origin so the browser can *read* our
 * response) — the real authorization is the key + the publishable key's origin
 * allowlist, checked below. Publishable keys are browser-exposed and thus
 * origin-restricted + low-privilege; secret keys are server-to-server.
 */
type Handler = (req: Request, ctx: ResolvedKey) => Promise<Response>;

const PER_KEY_LIMIT = 60;
const PER_KEY_WINDOW_MS = 60_000;

function readKey(req: Request): string | null {
  const auth = req.headers.get("authorization");
  if (auth && auth.startsWith("Bearer ")) return auth.slice(7).trim();
  return req.headers.get("x-api-key");
}

function corsHeaders(origin: string | null): Record<string, string> {
  if (!origin) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "authorization,content-type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

export function withApiKey(handler: Handler, opts: { require: ApiKeyType }) {
  return async (req: Request): Promise<Response> => {
    const origin = req.headers.get("origin");
    const cors = corsHeaders(origin);
    const fail = (status: number, error: string, extra: Record<string, string> = {}) =>
      NextResponse.json({ error }, { status, headers: { ...cors, ...extra } });

    // Preflight carries no auth header — answer it permissively; the real
    // request below still enforces the key + origin allowlist.
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });

    const resolved = await resolveOperatorByKey(readKey(req));
    if (!resolved) return fail(401, "Invalid or missing API key.");
    if (resolved.key.type !== opts.require)
      return fail(401, `This endpoint requires a ${opts.require} API key.`);
    if (!planCapabilities(resolved.operator).apiAccess)
      return fail(403, "API access requires the Growing plan.");

    // Publishable keys are exposed in the browser → they only work from an
    // origin the operator registered. (No Origin header = non-browser caller;
    // publishable keys are low-privilege, so we allow it.)
    if (opts.require === "publishable" && origin && !originAllowed(resolved.key, origin))
      return fail(403, "Origin not allowed for this API key.");

    const rl = await checkRateLimit(`apikey:${resolved.key.id}`, PER_KEY_LIMIT, PER_KEY_WINDOW_MS);
    if (!rl.allowed) {
      const retryAfter = Math.max(1, Math.ceil((rl.resetAt - Date.now()) / 1000));
      return fail(429, "Rate limit exceeded. Try again later.", { "retry-after": String(retryAfter) });
    }

    const res = await handler(req, resolved);
    for (const [k, v] of Object.entries(cors)) res.headers.set(k, v);
    return res;
  };
}
