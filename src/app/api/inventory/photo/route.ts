import { NextResponse } from "next/server";
import { getSessionOperator } from "@/lib/operator/session";
import { uploadItemPhoto } from "@/lib/inventory/photos";

export const dynamic = "force-dynamic";

/** Upload one inventory item photo (multipart `file`). Operator-scoped; the
 *  image is resized client-side before it gets here. Returns { url }. */
export async function POST(req: Request) {
  const op = await getSessionOperator();
  if (!op) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Expected multipart form data." }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "No file provided." }, { status: 400 });
  if (!file.type.startsWith("image/")) return NextResponse.json({ error: "File must be an image." }, { status: 400 });
  if (file.size > 8_388_608) return NextResponse.json({ error: "Image too large (8 MB max)." }, { status: 413 });

  try {
    const url = await uploadItemPhoto(op.id, file);
    return NextResponse.json({ url });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Upload failed." },
      { status: 500 },
    );
  }
}
