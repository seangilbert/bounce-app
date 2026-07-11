"use server";

import { revalidatePath } from "next/cache";
import { getSessionOperator } from "@/lib/operator/session";
import { getBooking } from "@/lib/bookings/repo";
import { getCustomer } from "@/lib/customers/repo";
import {
  uploadDocument,
  updateDocument,
  deleteDocument,
  DOC_TYPES,
  type DocType,
} from "@/lib/documents/repo";

export type ActionResult = { ok: true } | { ok: false; error: string };

const MAX_BYTES = 20 * 1024 * 1024; // 20 MB (matches the bucket limit)
const ALLOWED_MIME = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);
const VALID_TYPES = new Set(DOC_TYPES.map((t) => t.value));
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function cleanDate(v: FormDataEntryValue | null): string | null {
  const s = typeof v === "string" ? v.trim() : "";
  return s && ISO_DATE.test(s) ? s : null;
}

/** Upload a document (multipart: file, type, label?, expiresAt?, bookingId?, customerId?). */
export async function uploadDocumentAction(form: FormData): Promise<ActionResult> {
  const op = await getSessionOperator();
  if (!op) return { ok: false, error: "Not signed in." };

  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Choose a file to upload." };
  if (file.size > MAX_BYTES) return { ok: false, error: "File too large (20 MB max)." };
  if (file.type && !ALLOWED_MIME.has(file.type))
    return { ok: false, error: "Unsupported file type. Use PDF, an image, or a Word doc." };

  const type = String(form.get("type") ?? "other") as DocType;
  if (!VALID_TYPES.has(type)) return { ok: false, error: "Invalid document type." };

  const label = typeof form.get("label") === "string" ? (form.get("label") as string).trim() : "";

  // Only attach to a booking/customer that belongs to this operator (a stray or
  // spoofed id is rejected rather than silently linking across tenants).
  const bookingId = (form.get("bookingId") as string) || null;
  const customerId = (form.get("customerId") as string) || null;
  if (bookingId) {
    const b = await getBooking(bookingId).catch(() => null);
    if (!b || b.operatorId !== op.id) return { ok: false, error: "That booking isn't yours." };
  }
  if (customerId) {
    const c = await getCustomer(op.id, customerId);
    if (!c) return { ok: false, error: "That customer isn't yours." };
  }

  try {
    await uploadDocument(op.id, file, {
      type,
      label: label || null,
      expiresAt: cleanDate(form.get("expiresAt")),
      bookingId,
      customerId,
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Upload failed." };
  }

  revalidatePath("/documents");
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function updateDocumentAction(input: {
  id: string;
  type?: DocType;
  label?: string | null;
  expiresAt?: string | null;
}): Promise<ActionResult> {
  const op = await getSessionOperator();
  if (!op) return { ok: false, error: "Not signed in." };
  if (!input?.id) return { ok: false, error: "Missing document." };
  if (input.type && !VALID_TYPES.has(input.type)) return { ok: false, error: "Invalid document type." };
  if (input.expiresAt && !ISO_DATE.test(input.expiresAt)) return { ok: false, error: "Invalid date." };

  try {
    await updateDocument(op.id, input.id, {
      type: input.type,
      label: input.label,
      expiresAt: input.expiresAt,
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not save." };
  }
  revalidatePath("/documents");
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function deleteDocumentAction(id: string): Promise<ActionResult> {
  const op = await getSessionOperator();
  if (!op) return { ok: false, error: "Not signed in." };
  try {
    await deleteDocument(op.id, id);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not delete." };
  }
  revalidatePath("/documents");
  revalidatePath("/dashboard");
  return { ok: true };
}
