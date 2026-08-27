import { z } from "zod";

// Client-safe module: the wizard imports these values, so nothing here may
// touch next/headers, the Supabase clients, or the Anthropic SDK.

/** One model-drafted catalog item awaiting operator review. Mirrors the
 *  ItemInput contract in inventory/actions plus extraction metadata. */
export const StagedItemSchema = z.object({
  name: z.string().trim().min(1).max(120),
  category: z
    .enum(["bounce", "tent", "tables", "other"])
    .describe("Movables storefront taxonomy — never invent other values"),
  description: z.string().trim().max(500).nullable(),
  quantity: z.number().int().min(0).max(9999),
  basePrice: z.number().int().min(0).describe("price in CENTS"),
  priceUnit: z.enum(["per_day", "per_hour", "flat"]),
  footprint: z.object({
    w: z.number().min(0).max(999).nullable().describe("width in feet"),
    l: z.number().min(0).max(999).nullable().describe("length in feet"),
    h: z.number().min(0).max(999).nullable().describe("height in feet"),
  }),
  powerRequired: z.boolean(),
  images: z.array(z.string()).max(12).describe("http image URLs found in the data; [] if none"),
  active: z.boolean(),
  confidence: z.enum(["high", "medium", "low"]),
  notes: z
    .string()
    .max(300)
    .nullable()
    .describe("extraction caveats + data with no Movables field yet (weight, vendor, …)"),
  sourceRow: z.number().int().nullable().describe("1-based data row this came from"),
});
export type StagedItem = z.infer<typeof StagedItemSchema>;

export const ExtractionSchema = z.object({
  items: z.array(StagedItemSchema),
  warnings: z.array(z.string()).describe("chunk-level problems a human should review"),
});
export type Extraction = z.infer<typeof ExtractionSchema>;

/** Data rows sent to the model per extraction call. Sized so one chunk stays
 *  comfortably inside a single server-action invocation. */
export const IMPORT_CHUNK_ROWS = 8;

/** Crawled pages sent to the model per enrichment call. Kept small because the
 *  OUTPUT is the binding budget here — patches + site-only items for a big
 *  staged list truncated at 6 pages/8k tokens in live testing. */
export const ENRICH_CHUNK_PAGES = 4;

/** Site enrichment for one page chunk: patches onto already-staged items
 *  (referenced by their index in the numbered list the model was shown) plus
 *  products found on the site that aren't staged yet. */
export const EnrichmentSchema = z.object({
  patches: z.array(
    z.object({
      index: z.number().int().min(0).describe("index of the staged item this patch applies to"),
      description: z
        .string()
        .trim()
        .max(500)
        .nullable()
        .describe("fresh 1–3 sentence description grounded in the site copy; null if these pages say nothing about this item"),
      images: z.array(z.string()).max(6).describe("photo URLs of THIS item found on these pages"),
      footprint: z
        .object({
          w: z.number().min(0).max(999).nullable(),
          l: z.number().min(0).max(999).nullable(),
          h: z.number().min(0).max(999).nullable(),
        })
        .nullable()
        .describe("item dimensions in feet from these pages; null if not stated"),
    }),
  ),
  newItems: z.array(StagedItemSchema).describe("products on these pages that are NOT in the staged list"),
  warnings: z.array(z.string()),
});
export type Enrichment = z.infer<typeof EnrichmentSchema>;

/** Minimal RFC 4180 CSV parser (quoted fields, escaped quotes, CRLF). Returns
 *  rows of fields; blank lines dropped. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') inQuotes = false;
      else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.some((f) => f !== "")) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((f) => f !== "")) rows.push(row);
  return rows;
}

/** Re-serialize parsed fields as one CSV line (for building chunk payloads). */
export function toCsvLine(fields: string[]): string {
  return fields
    .map((f) => (/[",\n\r]/.test(f) ? `"${f.replace(/"/g, '""')}"` : f))
    .join(",");
}

/** Merge one enrichment chunk into the staged list: patches fill blanks only
 *  (spreadsheet data stays authoritative), images union up to the schema cap,
 *  and site-only products append unless a staged name already matches. */
export function applyEnrichment(staged: StagedItem[], e: Enrichment): StagedItem[] {
  const next = staged.map((s) => ({ ...s }));
  for (const p of e.patches) {
    const it = next[p.index];
    if (!it) continue;
    if (p.description && !it.description) it.description = p.description;
    if (p.images.length) it.images = [...new Set([...it.images, ...p.images])].slice(0, 12);
    if (p.footprint) {
      it.footprint = {
        w: it.footprint.w ?? p.footprint.w,
        l: it.footprint.l ?? p.footprint.l,
        h: it.footprint.h ?? p.footprint.h,
      };
    }
  }
  const names = new Set(next.map((s) => s.name.trim().toLowerCase()));
  for (const n of e.newItems) {
    const key = n.name.trim().toLowerCase();
    if (names.has(key)) continue;
    names.add(key);
    next.push(n);
  }
  return next;
}

/**
 * Which staged items can go live at commit, given the plan's live-item cap and
 * how many live items the operator already has. First-come within the batch:
 * items the operator marked active fill the remaining slots in order; the rest
 * import hidden (never dropped). Returns the per-item active flags to insert.
 */
export function planActivation(
  wantActive: boolean[],
  liveNow: number,
  cap: number,
): boolean[] {
  let slots = Number.isFinite(cap) ? Math.max(0, cap - liveNow) : Infinity;
  return wantActive.map((want) => {
    if (!want || slots <= 0) return false;
    slots--;
    return true;
  });
}
