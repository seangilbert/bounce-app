import { NextResponse } from "next/server";
import { z } from "zod";
import { getPaymentProvider } from "@/lib/payments";
import { checkRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

// Per-IP rate limit — creating checkout sessions hits the provider's API.
const RATE_LIMIT = 20;
const RATE_WINDOW_MS = 60_000;

function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

const CheckoutSchema = z.object({
  lineItems: z
    .array(
      z.object({
        name: z.string(),
        quantity: z.number().int().positive(),
        unitAmount: z.number().int().nonnegative().describe("Minor units, e.g. cents"),
      }),
    )
    .min(1),
  currency: z.string().default("usd"),
  successUrl: z.string().url(),
  cancelUrl: z.string().url(),
  customerEmail: z.string().email().optional(),
  metadata: z.record(z.string(), z.string()).optional(),
});

export async function POST(req: Request) {
  const rl = checkRateLimit(`checkout:${clientIp(req)}`, RATE_LIMIT, RATE_WINDOW_MS);
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

  const parsed = CheckoutSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request.", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const provider = getPaymentProvider();
    const result = await provider.createCheckout(parsed.data);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error.";
    // Missing/invalid provider config → 503; upstream provider failure → 502.
    const status =
      message.includes("is not set") || message.includes("not implemented")
        ? 503
        : 502;
    return NextResponse.json({ error: message }, { status });
  }
}
