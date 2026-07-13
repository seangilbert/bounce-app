import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/utils/supabase/admin";
import { generateUniqueSlug } from "@/lib/inventory/repo";
import { checkRateLimit } from "@/lib/rate-limit";
import { accentForIndex } from "@/lib/branding/palette";

export const dynamic = "force-dynamic";

const RATE_LIMIT = 5;
const RATE_WINDOW_MS = 60_000;

function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

const SignupSchema = z.object({
  businessName: z.string().trim().min(1, "Business name is required.").max(120),
  ownerName: z.string().trim().max(120).optional(),
  email: z.string().email(),
  password: z.string().min(8, "Password must be at least 8 characters."),
  plan: z.enum(["free", "solo", "growing"]).default("free"),
});

/**
 * Self-serve operator sign-up: creates the auth user, a new operator tenant, and
 * the owner membership. Auto-confirms the email since transactional email isn't
 * wired yet (email verification is a roadmap follow-up). All writes use the
 * service role; on partial failure we roll back what we created.
 */
export async function POST(req: Request) {
  const rl = await checkRateLimit(`signup:${clientIp(req)}`, RATE_LIMIT, RATE_WINDOW_MS);
  if (!rl.allowed) {
    const retryAfter = Math.max(1, Math.ceil((rl.resetAt - Date.now()) / 1000));
    return NextResponse.json(
      { error: "Too many attempts. Try again later." },
      { status: 429, headers: { "retry-after": String(retryAfter) } },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = SignupSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request." },
      { status: 400 },
    );
  }
  const { businessName, ownerName, email, password, plan } = parsed.data;
  const admin = createAdminClient();

  // 1) Create the auth user (auto-confirmed). Store their name so the app can
  // greet the actual person (distinct from the operator's owner_name).
  const userRes = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: ownerName ? { name: ownerName } : undefined,
  });
  if (userRes.error) {
    const dup = /already|registered|exists/i.test(userRes.error.message);
    return NextResponse.json(
      { error: dup ? "An account with this email already exists." : userRes.error.message },
      { status: dup ? 409 : 500 },
    );
  }
  const userId = userRes.data.user.id;

  // 2) Create the operator tenant. Assign a demo accent color round-robin by
  // existing operator count so consecutive signups look visually distinct
  // (operators will customize this later).
  const { count: opCount } = await admin
    .from("operators")
    .select("id", { count: "exact", head: true });
  const opRes = await admin
    .from("operators")
    .insert({
      name: businessName,
      contact_email: email,
      owner_name: ownerName ?? null,
      plan,
      slug: await generateUniqueSlug(businessName),
      brand_color: accentForIndex(opCount ?? 0).base,
    })
    .select("id")
    .single();
  if (opRes.error) {
    await admin.auth.admin.deleteUser(userId).catch(() => {});
    return NextResponse.json({ error: "Could not create your workspace." }, { status: 500 });
  }
  const operatorId = opRes.data.id as string;

  // 3) Link the user as the workspace admin (full access — the role migration
  // 0044 replaced the old "owner" role with "admin"/"employee").
  const memRes = await admin
    .from("operator_members")
    .insert({ operator_id: operatorId, user_id: userId, role: "admin" });
  if (memRes.error) {
    await admin.from("operators").delete().eq("id", operatorId);
    await admin.auth.admin.deleteUser(userId).catch(() => {});
    return NextResponse.json({ error: "Could not finish setting up your account." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, plan }, { status: 201 });
}
