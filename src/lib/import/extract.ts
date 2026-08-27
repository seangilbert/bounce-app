import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { getAnthropicClient } from "@/lib/llm/client";
import {
  EnrichmentSchema,
  ExtractionSchema,
  type Enrichment,
  type Extraction,
  type StagedItem,
  toCsvLine,
} from "./schema";
import type { CrawlPage } from "./crawl";

/** Extraction is mechanical mapping, not judgment — the mid-tier model handled
 *  a real 30-item competitor export flawlessly (validated 2026-08-27). */
const IMPORT_MODEL = "claude-sonnet-5";

const SYSTEM_PROMPT = `You convert a party-rental operator's inventory spreadsheet into clean catalog items for Movables, a bounce-house rental platform. You receive the sheet's header row and a CHUNK of its data rows (other chunks are processed separately — never merge across the chunk boundary, and extract one item per data row unless two rows in THIS chunk are unmistakably the same product). Never invent products, prices, or dimensions that are not supported by the data.

Field rules:
- name: clean up stray whitespace, keep the operator's own product names.
- category: "bounce" = inflatables of any kind (bounce houses, slides, combos, obstacle courses, interactive inflatables); "tent" = tents/canopies; "tables" = tables, chairs, linens; "other" = everything else (concessions, machines, games, services, supplies).
- quantity: units owned. Default 1 if absent.
- basePrice: integer CENTS. "$325.00" -> 32500. If a row's price is blank but derivable (e.g. a price-times-quantity column divided by quantity), derive it and say so in notes with lowered confidence. If truly unknown, use 0, confidence "low", and explain in notes.
- priceUnit: "per_day" for rentals unless the data clearly says hourly; "flat" for services, labor, or per-event supplies (e.g. "supplies for 25 people", DJ service).
- footprint: parse ANY dimension format into decimal feet — "40'x20'", "17’ L x 17’ W x 17’ H", "35' L X 18' W X 17\\" H" (17 inches tall is 1.4 ft — watch inch marks), "25x25" (assume feet). Two values = w and l, h null. Unlabeled order is L x W x H. Null for anything not stated. If a "space required" figure is clearly the setup area rather than the item itself, prefer item size when both exist, else use it and note it.
- powerRequired: true for inflatables and machines (blowers, concession machines), false for tables, chairs, tents, unpowered games, supplies, services.
- images: only real http(s) image URLs present in the data. Category or website page links are NOT images.
- active: true unless the data marks the item unavailable or retired.
- notes: one short line for anything lossy or inferred — weights ("weight 278 lb"), vendor, derived prices, ambiguous dimensions. Null when extraction was clean.
- confidence: "high" = everything mapped cleanly; "medium" = minor inference; "low" = guessed something material (price, identity).
- sourceRow: the 1-based data-row number given with each row.
- warnings: chunk-level issues (columns you ignored, rows you skipped, systematic ambiguity).`;

/**
 * Extract one chunk of spreadsheet rows into staged items. `rows` are parsed
 * CSV fields; `firstRowNumber` is the 1-based data-row number of rows[0] so
 * sourceRow stays meaningful across chunks.
 */
export async function extractChunk(
  header: string[],
  rows: string[][],
  firstRowNumber: number,
): Promise<Extraction> {
  const client = getAnthropicClient();
  const body = rows
    .map((r, i) => `row ${firstRowNumber + i}: ${toCsvLine(r)}`)
    .join("\n");
  const response = await client.messages.parse({
    model: IMPORT_MODEL,
    max_tokens: 8000,
    system: SYSTEM_PROMPT,
    output_config: { format: zodOutputFormat(ExtractionSchema) },
    messages: [
      {
        role: "user",
        content: `Header row:\n${toCsvLine(header)}\n\nData rows (${rows.length}):\n${body}`,
      },
    ],
  });
  if (response.stop_reason === "refusal") {
    throw new Error("The model declined to process this spreadsheet.");
  }
  if (!response.parsed_output) {
    throw new Error("Could not parse structured items from the model response.");
  }
  return response.parsed_output;
}

const ENRICH_PROMPT = `You enrich a party-rental operator's staged catalog items using pages crawled from their OWN public website (they asked us to migrate it). You receive a numbered list of staged items and a CHUNK of the site's pages (other chunks are processed separately).

Be economical: emit a patch ONLY for items these pages actually describe and only when you have something to add (a description for an item lacking one, photos, or dimensions) — never emit empty or no-op patches.

Return:
- patches: for each staged item these pages describe, a patch referencing its index. Write a fresh 1–3 sentence description in the operator's voice grounded in the page copy — NEVER copy sentences verbatim (the new store must not duplicate the old site's text). Attach up to 6 photo URLs that are clearly of THAT item (product-page galleries, its listing thumbnail, its page's og:image) — never logos, icons, banners, or another product's photo; a listing page's images belong to the products listed on it, attribute by adjacency only when unambiguous. Report the item's own dimensions in decimal feet when stated (prefer actual size over "space required" setup area). Match items to pages by product identity — names may differ slightly.
- newItems: rentable products clearly offered on these pages that are NOT in the staged list (full item objects, active true, note "found on website only"). Skip products you suspect are just a listing-page duplicate of a staged item. Category taxonomy: "bounce" = any inflatable; "tent" = tents/canopies; "tables" = tables/chairs/linens; "other" = everything else. Prices in CENTS; priceUnit "per_day" unless clearly hourly, "flat" for services/packages.
- warnings: page-level issues (products whose photos couldn't be attributed, conflicting prices vs the staged data, non-catalog pages ignored).

The staged data (from the operator's spreadsheet) is authoritative for quantity and price — never patch those; note conflicts in warnings instead. Ignore non-catalog pages except as background for tone.`;

/** Enrich staged items from one chunk of crawled pages. The staged list may be
 *  empty (URL-only import) — then everything arrives as newItems. */
export async function enrichChunk(staged: StagedItem[], pages: CrawlPage[]): Promise<Enrichment> {
  const client = getAnthropicClient();
  const itemList = staged.length
    ? staged
        .map(
          (s, i) =>
            `${i}: ${s.name} [${s.category}] ${s.description ? "(has description)" : "(no description)"}${
              s.images.length ? ` (${s.images.length} photos)` : " (no photos)"
            }`,
        )
        .join("\n")
    : "(none staged yet — every product found becomes a newItem)";
  const response = await client.messages.parse({
    model: IMPORT_MODEL,
    // Output is the binding budget: patches + site-only items for a large
    // staged list truncated at 8k in live testing (stop_reason max_tokens).
    max_tokens: 12000,
    system: ENRICH_PROMPT,
    output_config: { format: zodOutputFormat(EnrichmentSchema) },
    messages: [
      {
        role: "user",
        content: `Staged items:\n${itemList}\n\nWebsite pages (JSON, ${pages.length}):\n${JSON.stringify(pages)}`,
      },
    ],
  });
  if (response.stop_reason === "refusal") {
    throw new Error("The model declined to process this website.");
  }
  if (response.stop_reason === "max_tokens") {
    throw new Error("Enrichment output was truncated — the page batch produced too much data.");
  }
  if (!response.parsed_output) {
    throw new Error("Could not parse structured enrichment from the model response.");
  }
  return response.parsed_output;
}
