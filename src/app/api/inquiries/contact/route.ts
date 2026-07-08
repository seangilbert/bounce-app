import { NextResponse } from "next/server";
import { z } from "zod";
import { setInquiryContact } from "@/lib/inquiries/repo";
import { checkRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/** Public: the storefront chat attaches the visitor's email to their inquiry
 *  when the AI escalates, so the operator can email a reply back. Scoped by
 *  operator + inquiry id (both required); only sets contact fields. */
const Body = z.object({
  inquiryId: z.string().uuid(),
  operatorId: z.string().uuid(),
  email: z.string().email(),
  name: z.string().trim().max(120).optional(),
});

function clientIp(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}

export async function POST(req: Request) {
  const rl = checkRateLimit(`inq-contact:${clientIp(req)}`, 10, 60_000);
  if (!rl.allowed) return NextResponse.json({ error: "Too many attempts." }, { status: 429 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const parsed = Body.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid." }, { status: 400 });
  }

  try {
    const ok = await setInquiryContact(parsed.data.operatorId, parsed.data.inquiryId, {
      email: parsed.data.email,
      name: parsed.data.name ?? null,
    });
    if (!ok) return NextResponse.json({ error: "Inquiry not found." }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Could not save." },
      { status: 500 },
    );
  }
}
