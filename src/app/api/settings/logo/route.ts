import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/operator/session";
import { uploadLogo, removeLogo } from "@/lib/operator/logo";

export const dynamic = "force-dynamic";

/** Upload the operator's storefront logo (multipart `file`). Returns { url }. */
export async function POST(req: Request) {
  const g = await requireAdmin();
  if (!g.ok) return NextResponse.json({ error: g.error }, { status: 403 });
  const op = g.membership.operator;

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Expected multipart form data." }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "No file provided." }, { status: 400 });
  if (!file.type.startsWith("image/")) return NextResponse.json({ error: "File must be an image." }, { status: 400 });
  if (file.size > 2_097_152) return NextResponse.json({ error: "Logo too large (2 MB max)." }, { status: 413 });

  try {
    const url = await uploadLogo(op.id, file);
    revalidatePath("/settings");
    return NextResponse.json({ url });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Upload failed." }, { status: 500 });
  }
}

/** Remove the operator's logo. */
export async function DELETE() {
  const g = await requireAdmin();
  if (!g.ok) return NextResponse.json({ error: g.error }, { status: 403 });
  const op = g.membership.operator;
  try {
    await removeLogo(op.id);
    revalidatePath("/settings");
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Remove failed." }, { status: 500 });
  }
}
