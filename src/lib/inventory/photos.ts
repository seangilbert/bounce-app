import { createAdminClient } from "@/utils/supabase/admin";

/** Storage bucket for inventory item photos (see migration 0017). */
export const PHOTO_BUCKET = "item-photos";

/** Upload one image (already resized client-side) and return its public URL.
 *  Path is operator-scoped so photos can be cleaned up + attributed per tenant. */
export async function uploadItemPhoto(operatorId: string, file: File): Promise<string> {
  const supabase = createAdminClient();
  const ext = (file.type.split("/")[1] || "jpg").replace("jpeg", "jpg");
  const path = `${operatorId}/${crypto.randomUUID()}.${ext}`;
  const bytes = Buffer.from(await file.arrayBuffer());

  const { error } = await supabase.storage.from(PHOTO_BUCKET).upload(path, bytes, {
    contentType: file.type || "image/jpeg",
    upsert: false,
  });
  if (error) throw new Error(error.message);

  return supabase.storage.from(PHOTO_BUCKET).getPublicUrl(path).data.publicUrl;
}

/** The public path (inside the bucket) for one of our photo URLs, or null. */
function pathOf(url: string, operatorId: string): string | null {
  const marker = `/${PHOTO_BUCKET}/`;
  const i = url.indexOf(marker);
  if (i === -1) return null;
  const path = url.slice(i + marker.length);
  // Only ever touch this operator's own files.
  return path.startsWith(`${operatorId}/`) ? path : null;
}

/** Best-effort removal of item photos by their public URLs (operator-scoped). */
export async function removeItemPhotos(operatorId: string, urls: string[]): Promise<void> {
  const paths = urls.map((u) => pathOf(u, operatorId)).filter((p): p is string => p !== null);
  if (paths.length === 0) return;
  const supabase = createAdminClient();
  await supabase.storage.from(PHOTO_BUCKET).remove(paths);
}

/** Current photo URLs on an item (operator-scoped), for orphan cleanup. */
export async function getItemImages(operatorId: string, id: string): Promise<string[]> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("items")
    .select("images")
    .eq("id", id)
    .eq("operator_id", operatorId)
    .single();
  return (data?.images as string[] | null) ?? [];
}
