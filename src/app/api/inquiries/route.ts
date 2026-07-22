import { NextResponse } from "next/server";
import { handleInquiry, InquirySchema } from "@/lib/llm/assistant";
import { checkRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
// The assistant makes a Claude call; give it headroom.
export const maxDuration = 60;

// Public acquisition hook (spec 2.1) — rate-limited since each call hits Claude.
// NOTE: the Free-tier monthly cap (20/mo per operator) still needs a persistent
// per-operator counter; this per-IP limit is only an abuse/cost backstop.
const RATE_LIMIT = 10;
const RATE_WINDOW_MS = 60_000;

function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

export async function POST(req: Request) {
  const rl = await checkRateLimit(`inquiries:${clientIp(req)}`, RATE_LIMIT, RATE_WINDOW_MS);
  if (!rl.allowed) {
    const retryAfter = Math.max(1, Math.ceil((rl.resetAt - Date.now()) / 1000));
    return NextResponse.json(
      { error: "Rate limit exceeded. Try again later." },
      { status: 429, headers: { "retry-after": String(retryAfter) } },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = InquirySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request.", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  // The storefront names its operator (by slug → id). Require it explicitly
  // rather than letting the agent default to another tenant.
  if (!parsed.data.operatorId) {
    return NextResponse.json({ error: "operatorId is required." }, { status: 400 });
  }

  try {
    const result = await handleInquiry(parsed.data);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error.";
    const status = message.includes("ANTHROPIC_API_KEY") ? 503 : 502;
    return NextResponse.json({ error: message }, { status });
  }
}
