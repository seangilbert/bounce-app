import { NextResponse } from "next/server";
import { withApiKey } from "@/lib/api/with-api-key";
import { handleInquiry, InquirySchema } from "@/lib/llm/assistant";

export const dynamic = "force-dynamic";
// The agent makes a Claude call; give it headroom.
export const maxDuration = 60;

/**
 * POST /api/v1/agent
 * One turn of the conversational quote agent for the key's operator. Body is the
 * InquirySchema (messages + optional dates/contact/inquiryId). The operator is
 * forced from the API key — a caller can't target another tenant — and the
 * per-operator monthly AI-quote cap is enforced inside handleInquiry.
 * Publishable key.
 */
const handler = withApiKey(async (req, { operator }) => {
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

  try {
    // Override operatorId with the key's operator — the request body can't pick a tenant.
    const result = await handleInquiry({ ...parsed.data, operatorId: operator.id });
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error.";
    const status = message.includes("ANTHROPIC_API_KEY") ? 503 : 502;
    return NextResponse.json({ error: message }, { status });
  }
}, { require: "publishable" });

export { handler as POST, handler as OPTIONS };
