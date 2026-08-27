// Catalog import: extract inventory items from an operator's spreadsheet into
// Movables item drafts — the concierge-migration tool and the future import
// agent's engine. One structured-output model call maps arbitrary CSV shapes
// (any column names, messy dimension strings, dollar prices) onto the item
// schema; nothing is written unless --commit is passed.
//
//   node --env-file=.env.local scripts/import-catalog.mjs <file.csv> [options]
//
// Options:
//   --operator <id|slug>  operator to import into (required with --commit)
//   --commit              insert the staged items (default: dry run)
//   --out <path>          staged-JSON path (default: <file>.staged.json)
//
// Dry run writes staged JSON for review; --commit also fetches any http image
// URLs into the item-photos bucket so imported items never depend on the old
// site staying up. Items whose name already exists for the operator are
// skipped, so reruns don't duplicate.
import { readFileSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";

const IMPORT_MODEL = process.env.IMPORT_MODEL ?? "claude-sonnet-5";
/** Mirrors MAX_TOTAL_ITEMS in src/lib/inventory/live-cap.ts (scripts can't
 *  import app TS) — the plan-independent abuse ceiling on catalog size. */
const MAX_TOTAL_ITEMS = 500;

// ---- args -------------------------------------------------------------------
const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  return i === -1 ? null : (args.splice(i, 2)[1] ?? null);
};
const has = (name) => {
  const i = args.indexOf(name);
  return i !== -1 && Boolean(args.splice(i, 1));
};
const commit = has("--commit");
const operatorRef = flag("--operator");
const outPath = flag("--out");
const csvPath = args[0];
if (!csvPath) {
  console.error("usage: node --env-file=.env.local scripts/import-catalog.mjs <file.csv> [--operator <id|slug>] [--commit] [--out <path>]");
  process.exit(1);
}

// ---- minimal RFC 4180 CSV parser (no dependency in the app for this yet) ----
function parseCsv(text) {
  const rows = [];
  let row = [], field = "", inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') inQuotes = false;
      else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((f) => f !== "")) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((f) => f !== "")) rows.push(row);
  return rows;
}

// ---- extraction schema (mirrors the ItemInput contract in inventory/actions) ----
const StagedItem = z.object({
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
const Extraction = z.object({
  items: z.array(StagedItem),
  warnings: z.array(z.string()).describe("file-level problems a human should review"),
});

const SYSTEM_PROMPT = `You convert a party-rental operator's inventory spreadsheet into clean catalog items for Movables, a bounce-house rental platform. Extract one item per distinct rentable product. Never invent products, prices, or dimensions that are not supported by the data.

Field rules:
- name: clean up stray whitespace, keep the operator's own product names.
- category: "bounce" = inflatables of any kind (bounce houses, slides, combos, obstacle courses, interactive inflatables); "tent" = tents/canopies; "tables" = tables, chairs, linens; "other" = everything else (concessions, machines, games, services, supplies).
- quantity: units owned. Default 1 if absent.
- basePrice: integer CENTS. "$325.00" -> 32500. If a row's price is blank but derivable (e.g. a price-times-quantity column divided by quantity), derive it and say so in notes with lowered confidence. If truly unknown, use 0, confidence "low", and explain in notes.
- priceUnit: "per_day" for rentals unless the data clearly says hourly; "flat" for services, labor, or per-event supplies (e.g. "supplies for 25 people", DJ service).
- footprint: parse ANY dimension format into decimal feet — "40'x20'" (w 20, l 40 or as labeled), "17’ L x 17’ W x 17’ H", "35' L X 18' W X 17\\" H" (17 inches tall is 1.4 ft — watch inch marks), "25x25" (assume feet). Two values = w and l, h null. Unlabeled order is L x W x H. Null for anything not stated. If a "space required" figure is clearly the setup area rather than the item itself, prefer item size when both exist, else use it and note it.
- powerRequired: true for inflatables and machines (blowers, concession machines), false for tables, chairs, tents, unpowered games, supplies, services.
- images: only real http(s) image URLs present in the data. Category or website page links are NOT images.
- active: true unless the data marks the item unavailable or retired.
- notes: one short line for anything lossy or inferred — weights ("weight 278 lb"), vendor, package/parent relationships, derived prices, ambiguous dimensions. Null when extraction was clean.
- confidence: "high" = everything mapped cleanly; "medium" = minor inference (parsed odd dimensions, assumed unit); "low" = guessed something material (price, identity).
- warnings: file-level issues (columns you ignored entirely, rows you merged or skipped, systematic ambiguity).

Deduplicate rows that are clearly the same product; sum quantities only when that is obviously right and note it.`;

// ---- run --------------------------------------------------------------------
const csvText = readFileSync(csvPath, "utf8");
const rows = parseCsv(csvText);
if (rows.length < 2) throw new Error("CSV has no data rows.");
console.log(`Read ${rows.length - 1} data rows from ${csvPath}`);

const anthropic = new Anthropic();
const t0 = Date.now();
const msg = await anthropic.messages.parse({
  model: IMPORT_MODEL,
  max_tokens: 16000,
  system: SYSTEM_PROMPT,
  messages: [
    {
      role: "user",
      content: `Spreadsheet (header row first, ${rows.length - 1} data rows):\n\n${csvText}`,
    },
  ],
  output_config: { format: zodOutputFormat(Extraction, "extraction") },
});
if (msg.stop_reason === "refusal" || !msg.parsed_output) {
  throw new Error(`extraction failed (stop_reason=${msg.stop_reason})`);
}
const { items, warnings } = msg.parsed_output;
console.log(
  `Extracted ${items.length} items in ${((Date.now() - t0) / 1000).toFixed(1)}s ` +
    `(${msg.usage.input_tokens} in / ${msg.usage.output_tokens} out, ${IMPORT_MODEL})`,
);

// ---- report -----------------------------------------------------------------
const staged = outPath ?? `${csvPath}.staged.json`;
writeFileSync(staged, JSON.stringify({ source: csvPath, model: IMPORT_MODEL, warnings, items }, null, 2));

const money = (c) => `$${(c / 100).toFixed(2)}`;
const dims = (f) =>
  [f.w, f.l, f.h].some((v) => v !== null)
    ? `${f.w ?? "?"}x${f.l ?? "?"}${f.h !== null ? `x${f.h}` : ""}ft`
    : "—";
for (const it of items) {
  const mark = it.confidence === "high" ? " " : it.confidence === "medium" ? "~" : "!";
  console.log(
    `${mark} ${it.name.padEnd(40)} ${String(it.quantity).padStart(3)}x ${money(it.basePrice).padStart(9)} ` +
      `${it.priceUnit.padEnd(8)} ${it.category.padEnd(6)} ${dims(it.footprint).padEnd(14)}${it.notes ? ` | ${it.notes}` : ""}`,
  );
}
for (const w of warnings) console.log(`⚠ ${w}`);
console.log(`\nStaged to ${staged}`);

if (!commit) {
  console.log("Dry run — review the staged file, then rerun with --operator <id|slug> --commit to import.");
  process.exit(0);
}

// ---- commit -----------------------------------------------------------------
if (!operatorRef) throw new Error("--commit requires --operator <id|slug>");
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const isUuid = /^[0-9a-f-]{36}$/i.test(operatorRef);
const { data: op, error: opErr } = await db
  .from("operators")
  .select("id, name, slug")
  .eq(isUuid ? "id" : "slug", operatorRef)
  .single();
if (opErr || !op) throw new Error(`operator not found: ${operatorRef}`);
console.log(`\nImporting into ${op.name} (${op.id})`);

const { data: existing } = await db.from("items").select("name").eq("operator_id", op.id);
const existingNames = new Set((existing ?? []).map((i) => i.name.trim().toLowerCase()));
if ((existing?.length ?? 0) + items.length > MAX_TOTAL_ITEMS) {
  throw new Error(`import would exceed the ${MAX_TOTAL_ITEMS}-item catalog ceiling`);
}

/** Copy an external image into the item-photos bucket ({operatorId}/{uuid}.{ext},
 *  public URL back) so the item outlives the operator's old website. */
async function ingestImage(url) {
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) throw new Error(`fetch ${res.status}`);
  const type = res.headers.get("content-type")?.split(";")[0] ?? "";
  const ext = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" }[type];
  if (!ext) throw new Error(`unsupported type ${type || "unknown"}`);
  const bytes = Buffer.from(await res.arrayBuffer());
  if (bytes.length > 8 * 1024 * 1024) throw new Error("over 8MB");
  const path = `${op.id}/${randomUUID()}.${ext}`;
  const { error } = await db.storage.from("item-photos").upload(path, bytes, { contentType: type });
  if (error) throw new Error(error.message);
  return db.storage.from("item-photos").getPublicUrl(path).data.publicUrl;
}

let inserted = 0, skipped = 0;
for (const it of items) {
  if (existingNames.has(it.name.trim().toLowerCase())) {
    console.log(`skip (exists): ${it.name}`);
    skipped++;
    continue;
  }
  const images = [];
  for (const url of it.images) {
    try {
      images.push(await ingestImage(url));
    } catch (e) {
      console.log(`  image failed for ${it.name}: ${url} (${e.message})`);
    }
  }
  const { error } = await db.from("items").insert({
    operator_id: op.id,
    name: it.name,
    description: it.description,
    category: it.category,
    quantity: it.quantity,
    base_price: it.basePrice,
    price_unit: it.priceUnit,
    footprint_w: it.footprint.w,
    footprint_l: it.footprint.l,
    footprint_h: it.footprint.h,
    power_required: it.powerRequired,
    images,
    active: it.active,
  });
  if (error) throw new Error(`insert failed for "${it.name}": ${error.message}`);
  inserted++;
}
console.log(`\nDone: ${inserted} imported, ${skipped} skipped (already present).`);
