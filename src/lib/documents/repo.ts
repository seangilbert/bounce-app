import { createAdminClient } from "@/utils/supabase/admin";

/** Private storage bucket for operator business documents (see migration 0040). */
export const DOCS_BUCKET = "operator-docs";

export type DocType =
  | "coi"
  | "license"
  | "inspection"
  | "w9"
  | "permit"
  | "waiver"
  | "contract"
  | "other";

/** Display metadata per type. `tracksExpiry` drives the dashboard warning. */
export const DOC_TYPES: { value: DocType; label: string; tracksExpiry: boolean }[] = [
  { value: "coi", label: "Certificate of insurance", tracksExpiry: true },
  { value: "license", label: "Business license", tracksExpiry: true },
  { value: "inspection", label: "Safety / inspection record", tracksExpiry: true },
  { value: "permit", label: "Permit", tracksExpiry: true },
  { value: "w9", label: "W-9 / tax form", tracksExpiry: false },
  { value: "waiver", label: "Waiver template", tracksExpiry: false },
  { value: "contract", label: "Rental agreement / contract", tracksExpiry: false },
  { value: "other", label: "Other", tracksExpiry: false },
];

export function docTypeLabel(type: string): string {
  return DOC_TYPES.find((t) => t.value === type)?.label ?? "Document";
}

export interface OperatorDocument {
  id: string;
  operatorId: string;
  type: DocType;
  label: string | null;
  filePath: string;
  fileName: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  expiresAt: string | null;
  bookingId: string | null;
  customerId: string | null;
  createdAt: string;
  /** Short-lived signed URL for download (present when listed). */
  downloadUrl?: string | null;
}

interface DocumentRow {
  id: string;
  operator_id: string;
  type: DocType;
  label: string | null;
  file_path: string;
  file_name: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  expires_at: string | null;
  booking_id: string | null;
  customer_id: string | null;
  created_at: string;
}

function rowToDoc(r: DocumentRow): OperatorDocument {
  return {
    id: r.id,
    operatorId: r.operator_id,
    type: r.type,
    label: r.label,
    filePath: r.file_path,
    fileName: r.file_name,
    mimeType: r.mime_type,
    sizeBytes: r.size_bytes,
    expiresAt: r.expires_at,
    bookingId: r.booking_id,
    customerId: r.customer_id,
    createdAt: r.created_at,
  };
}

const SIGNED_URL_TTL = 60 * 30; // 30 minutes

/** Attach short-lived signed download URLs to a batch of documents. */
async function withSignedUrls(docs: OperatorDocument[]): Promise<OperatorDocument[]> {
  if (docs.length === 0) return docs;
  const supabase = createAdminClient();
  const { data } = await supabase.storage
    .from(DOCS_BUCKET)
    .createSignedUrls(docs.map((d) => d.filePath), SIGNED_URL_TTL);
  const byPath = new Map((data ?? []).map((s) => [s.path, s.signedUrl]));
  return docs.map((d) => ({ ...d, downloadUrl: byPath.get(d.filePath) ?? null }));
}

export interface ListDocumentsFilter {
  bookingId?: string;
  customerId?: string;
  type?: DocType;
}

/** List an operator's documents (newest first), with signed download URLs. */
export async function listDocuments(
  operatorId: string,
  filter: ListDocumentsFilter = {},
): Promise<OperatorDocument[]> {
  const supabase = createAdminClient();
  let q = supabase.from("documents").select().eq("operator_id", operatorId);
  if (filter.bookingId) q = q.eq("booking_id", filter.bookingId);
  if (filter.customerId) q = q.eq("customer_id", filter.customerId);
  if (filter.type) q = q.eq("type", filter.type);
  const { data, error } = await q.order("created_at", { ascending: false });
  if (error) throw new Error(`listDocuments failed: ${error.message}`);
  return withSignedUrls((data as DocumentRow[]).map(rowToDoc));
}

export interface NewDocument {
  type: DocType;
  label?: string | null;
  fileName?: string | null;
  mimeType?: string | null;
  sizeBytes?: number | null;
  expiresAt?: string | null;
  bookingId?: string | null;
  customerId?: string | null;
}

/** Upload a file to the operator's private bucket and record it. */
export async function uploadDocument(
  operatorId: string,
  file: File,
  meta: NewDocument,
): Promise<OperatorDocument> {
  const supabase = createAdminClient();
  const safeName = (file.name || "document").replace(/[^\w.\-]+/g, "_").slice(-80);
  const path = `${operatorId}/${crypto.randomUUID()}-${safeName}`;
  const bytes = Buffer.from(await file.arrayBuffer());

  const { error: upErr } = await supabase.storage.from(DOCS_BUCKET).upload(path, bytes, {
    contentType: file.type || "application/octet-stream",
    upsert: false,
  });
  if (upErr) throw new Error(`upload failed: ${upErr.message}`);

  const { data, error } = await supabase
    .from("documents")
    .insert({
      operator_id: operatorId,
      type: meta.type,
      label: meta.label?.trim() || null,
      file_path: path,
      file_name: file.name || safeName,
      mime_type: file.type || meta.mimeType || null,
      size_bytes: file.size ?? meta.sizeBytes ?? null,
      expires_at: meta.expiresAt || null,
      booking_id: meta.bookingId || null,
      customer_id: meta.customerId || null,
    })
    .select()
    .single();
  if (error) {
    // Roll back the orphaned file so a failed insert doesn't leak storage.
    await supabase.storage.from(DOCS_BUCKET).remove([path]);
    throw new Error(`createDocument failed: ${error.message}`);
  }
  return rowToDoc(data as DocumentRow);
}

export interface DocumentPatch {
  type?: DocType;
  label?: string | null;
  expiresAt?: string | null;
  bookingId?: string | null;
  customerId?: string | null;
}

/** Update a document's metadata (operator-scoped). */
export async function updateDocument(
  operatorId: string,
  id: string,
  patch: DocumentPatch,
): Promise<void> {
  const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.type !== undefined) row.type = patch.type;
  if (patch.label !== undefined) row.label = patch.label?.trim() || null;
  if (patch.expiresAt !== undefined) row.expires_at = patch.expiresAt || null;
  if (patch.bookingId !== undefined) row.booking_id = patch.bookingId || null;
  if (patch.customerId !== undefined) row.customer_id = patch.customerId || null;

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("documents")
    .update(row)
    .eq("id", id)
    .eq("operator_id", operatorId);
  if (error) throw new Error(`updateDocument failed: ${error.message}`);
}

/** Delete a document row + its stored file (operator-scoped). */
export async function deleteDocument(operatorId: string, id: string): Promise<void> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("documents")
    .select("file_path")
    .eq("id", id)
    .eq("operator_id", operatorId)
    .maybeSingle();
  if (error) throw new Error(`deleteDocument lookup failed: ${error.message}`);
  if (!data) return;

  await supabase.storage.from(DOCS_BUCKET).remove([data.file_path as string]);
  const { error: delErr } = await supabase
    .from("documents")
    .delete()
    .eq("id", id)
    .eq("operator_id", operatorId);
  if (delErr) throw new Error(`deleteDocument failed: ${delErr.message}`);
}

export interface ExpiringDocument {
  id: string;
  type: DocType;
  label: string | null;
  expiresAt: string;
  /** Whole days until expiry (negative = already expired). */
  daysLeft: number;
}

/**
 * Documents that are expired or expiring within `withinDays`, for the dashboard
 * warning. Only types that track expiry are considered.
 */
export async function getExpiringDocuments(
  operatorId: string,
  today: string,
  withinDays = 30,
): Promise<ExpiringDocument[]> {
  const supabase = createAdminClient();
  const horizon = addDays(today, withinDays);
  const { data, error } = await supabase
    .from("documents")
    .select("id, type, label, expires_at")
    .eq("operator_id", operatorId)
    .not("expires_at", "is", null)
    .lte("expires_at", horizon)
    .order("expires_at", { ascending: true });
  if (error) throw new Error(`getExpiringDocuments failed: ${error.message}`);

  const tracked = new Set(DOC_TYPES.filter((t) => t.tracksExpiry).map((t) => t.value));
  return (data as { id: string; type: DocType; label: string | null; expires_at: string }[])
    .filter((d) => tracked.has(d.type))
    .map((d) => ({
      id: d.id,
      type: d.type,
      label: d.label,
      expiresAt: d.expires_at,
      daysLeft: daysBetween(today, d.expires_at),
    }));
}

function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function daysBetween(from: string, to: string): number {
  const a = new Date(`${from}T00:00:00Z`).getTime();
  const b = new Date(`${to}T00:00:00Z`).getTime();
  return Math.round((b - a) / 86_400_000);
}
