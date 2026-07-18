// Client-safe document types + display metadata. Kept apart from repo.ts (which
// imports the server-only Supabase client) so client components can use these
// without pulling `next/headers` into the browser bundle.

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

export interface ExpiringDocument {
  id: string;
  type: DocType;
  label: string | null;
  expiresAt: string;
  /** Whole days until expiry (negative = already expired). */
  daysLeft: number;
}
