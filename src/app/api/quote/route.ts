import { NextResponse } from "next/server";
import { generateQuote, QuoteInputSchema } from "@/lib/llm/quote";

export const dynamic = "force-dynamic";
// Give the Claude call headroom; quote generation is well under this.
export const maxDuration = 60;

export async function POST(req: Request) {
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
