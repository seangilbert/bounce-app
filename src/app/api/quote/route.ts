import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { generateQuote, QuoteInputSchema } from "@/lib/llm/quote";
import { checkRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
// Give the Claude call headroom; quote generation is well under this.
export const maxDuration = 60;

// Per-IP rate limit: at most RATE_LIMIT requests per RATE_WINDOW_MS.
const RATE_LIMIT = 10;
const RATE_WINDOW_MS = 60_000;

/** Best-effort client IP from Vercel's forwarding headers. */
function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

/** Constant-time comparison of the provided secret against the configured one. */
function secretMatches(provided: string | null): boolean {
  const expected = process.env.QUOTE_API_SECRET;
  if (!expected || !provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function POST(req: Request) {
  // Fail closed: if no secret is configured, the endpoint is unavailable
  // rather than silently open.
  if (!process.env.QUOTE_API_SECRET) {
    return NextResponse.json(
      { error: "Quote API is not configured (QUOTE_API_SECRET unset)." },
      { status: 503 },
    );
  }

  // Rate limit by IP first — this also throttles secret-guessing attempts.
  const rl = await checkRateLimit(`quote:${clientIp(req)}`, RATE_LIMIT, RATE_WINDOW_MS);
  if (!rl.allowed) {
    const retryAfter = Math.max(1, Math.ceil((rl.resetAt - Date.now()) / 1000));
    return NextResponse.json(
      { error: "Rate limit exceeded. Try again later." },
      { status: 429, headers: { "retry-after": String(retryAfter) } },
    );
  }

  // Shared-secret auth.
  if (!secretMatches(req.headers.get("x-api-key"))) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = QuoteInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request.", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const quote = await generateQuote(parsed.data);
    return NextResponse.json({ quote });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error.";
    // Missing config → 503 (service not configured); everything else →
    // 502 (upstream model call failed).
    const status = message.includes("ANTHROPIC_API_KEY") ? 503 : 502;
    return NextResponse.json({ error: message }, { status });
  }
}
