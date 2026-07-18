import { createAdminClient } from "@/utils/supabase/admin";
import { createClient } from "@/utils/supabase/server";

/** Storage bucket for operator logos (see migration 0032). */
export const LOGO_BUCKET = "operator-logos";

/** The public path (inside the bucket) for one of our logo URLs, or null.
 *  Only ever resolves this operator's own files. */
function pathOf(url: string, operatorId: string): string | null {
  const marker = `/${LOGO_BUCKET}/`;
  const i = url.indexOf(marker);
  if (i === -1) return null;
  const path = url.slice(i + marker.length);
  return path.startsWith(`${operatorId}/`) ? path : null;
}

/**
 * Upload a new logo, point operators.logo_url at it, and best-effort remove the
 * previous file. Operator-scoped path. Returns the new public URL.
 */
export async function uploadLogo(operatorId: string, file: File): Promise<string> {
  const admin = createAdminClient(); // bucket ops
  const db = createClient(); // operators table, user-scoped (operator SELECT/UPDATE, 0056)
  const ext = (file.type.split("/")[1] || "png").replace("jpeg", "jpg");
  const path = `${operatorId}/logo-${crypto.randomUUID()}.${ext}`;
  const bytes = Buffer.from(await file.arrayBuffer());

  const { error } = await admin.storage.from(LOGO_BUCKET).upload(path, bytes, {
    contentType: file.type || "image/png",
    upsert: false,
  });
  if (error) throw new Error(error.message);
  const url = admin.storage.from(LOGO_BUCKET).getPublicUrl(path).data.publicUrl;

  // Capture the old logo before overwriting, then swap + clean up.
  const { data: prev } = await db.from("operators").select("logo_url").eq("id", operatorId).single();
  const { error: updErr } = await db.from("operators").update({ logo_url: url }).eq("id", operatorId);
  if (updErr) throw new Error(updErr.message);

  const oldPath = prev?.logo_url ? pathOf(prev.logo_url, operatorId) : null;
  if (oldPath) await admin.storage.from(LOGO_BUCKET).remove([oldPath]);

  return url;
}

/** Clear the operator's logo and best-effort remove its stored file. */
export async function removeLogo(operatorId: string): Promise<void> {
  const admin = createAdminClient(); // bucket op
  const db = createClient(); // operators table, user-scoped (operator SELECT/UPDATE, 0056)
  const { data: prev } = await db.from("operators").select("logo_url").eq("id", operatorId).single();
  await db.from("operators").update({ logo_url: null }).eq("id", operatorId);
  const oldPath = prev?.logo_url ? pathOf(prev.logo_url, operatorId) : null;
  if (oldPath) await admin.storage.from(LOGO_BUCKET).remove([oldPath]);
}
