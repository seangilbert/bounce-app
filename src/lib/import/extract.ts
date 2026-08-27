import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { getAnthropicClient } from "@/lib/llm/client";
import { ExtractionSchema, type Extraction, toCsvLine } from "./schema";

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
