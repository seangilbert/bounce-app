"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/operator/session";
import { checkRateLimit } from "@/lib/rate-limit";
import { planCapabilities } from "@/lib/plans";
import { countItems, createItem } from "@/lib/inventory/repo";
import { uploadItemPhoto } from "@/lib/inventory/photos";
import { MAX_TOTAL_ITEMS } from "@/lib/inventory/live-cap";
import {
  IMPORT_CHUNK_ROWS,
  StagedItemSchema,
  parseCsv,
  planActivation,
  type StagedItem,
} from "@/lib/import/schema";
import { extractChunk } from "@/lib/import/extract";
import { createImportJob, getImportJob, updateImportJob } from "@/lib/import/repo";

export type StartResult =
  | { ok: true; jobId: string; totalChunks: number; totalRows: number }
  | { ok: false; error: string };

export type ChunkResult =
  | {
      ok: true;
      status: "processing" | "review";
      doneChunks: number;
      totalChunks: number;
      staged: StagedItem[];
      warnings: string[];
    }
  | { ok: false; error: string };

export type CommitResult =
  | { ok: true; imported: number; live: number; hidden: number; imagesCopied: number }
  | { ok: false; error: string };

const StartInput = z.object({
  sourceName: z.string().trim().max(200).nullable(),
  // Server actions carry a ~1MB body by default; a 500-item sheet is far under.
  csv: z.string().min(1).max(900_000),
});

export async function startImportAction(input: unknown): Promise<StartResult> {
  const g = await requireAdmin();
  if (!g.ok) return { ok: false, error: g.error };
  const op = g.membership.operator;
  const p = StartInput.safeParse(input);
  if (!p.success) return { ok: false, error: "Could not read that file as CSV text." };

  const rows = parseCsv(p.data.csv);
  const dataRows = rows.length - 1;
  if (dataRows < 1) return { ok: false, error: "That file has a header but no data rows." };
  if (dataRows > MAX_TOTAL_ITEMS) {
    return { ok: false, error: `That's ${dataRows} rows — imports are limited to ${MAX_TOTAL_ITEMS} items.` };
  }

  const rl = await checkRateLimit(`import:${op.id}`, 10, 24 * 60 * 60 * 1000);
  if (!rl.allowed) return { ok: false, error: "Import limit reached for today — try again tomorrow." };

  const totalChunks = Math.ceil(dataRows / IMPORT_CHUNK_ROWS);
  const job = await createImportJob({
    operatorId: op.id,
    sourceName: p.data.sourceName,
    sourceCsv: p.data.csv,
    totalChunks,
  });
  return { ok: true, jobId: job.id, totalChunks, totalRows: dataRows };
}

/** Process the job's next pending chunk — one bounded model call per action
 *  invocation, so any hosting plan's duration limit holds; the wizard loops. */
export async function processImportChunkAction(jobId: string): Promise<ChunkResult> {
  const g = await requireAdmin();
  if (!g.ok) return { ok: false, error: g.error };
  const op = g.membership.operator;

  const job = await getImportJob(op.id, jobId);
  if (!job) return { ok: false, error: "Import not found." };
  if (job.status === "failed") return { ok: false, error: job.error ?? "Import failed." };
  if (job.status !== "processing") {
    return {
      ok: true,
      status: "review",
      doneChunks: job.doneChunks,
      totalChunks: job.totalChunks,
      staged: job.staged,
      warnings: job.warnings,
    };
  }

  const rows = parseCsv(job.sourceCsv);
  const header = rows[0];
  const start = 1 + job.doneChunks * IMPORT_CHUNK_ROWS;
  const chunk = rows.slice(start, start + IMPORT_CHUNK_ROWS);
  try {
    const result = await extractChunk(header, chunk, start);
    const staged = [...job.staged, ...result.items];
    const warnings = [...job.warnings, ...result.warnings];
    const doneChunks = job.doneChunks + 1;
    const finished = doneChunks >= job.totalChunks;
    await updateImportJob(op.id, jobId, {
      staged,
      warnings,
      doneChunks,
      status: finished ? "review" : "processing",
    });
    return {
      ok: true,
      status: finished ? "review" : "processing",
      doneChunks,
      totalChunks: job.totalChunks,
      staged,
      warnings,
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Extraction failed.";
    await updateImportJob(op.id, jobId, { status: "failed", error: message });
    return { ok: false, error: message };
  }
}

/** Copy an external image into the item-photos bucket so imported items never
 *  depend on the operator's old site staying up. */
async function ingestImage(operatorId: string, url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { redirect: "follow" });
    if (!res.ok) return null;
    const type = res.headers.get("content-type")?.split(";")[0] ?? "";
    if (!["image/jpeg", "image/png", "image/webp"].includes(type)) return null;
    const bytes = await res.arrayBuffer();
    if (bytes.byteLength > 8 * 1024 * 1024) return null;
    return await uploadItemPhoto(operatorId, new File([bytes], "import", { type }));
  } catch {
    return null;
  }
}

const CommitInput = z.object({
  jobId: z.string().uuid(),
  items: z.array(StagedItemSchema).min(1).max(MAX_TOTAL_ITEMS),
});

/** Bound on external image fetches per commit, so the action stays inside one
 *  invocation's budget even for a big catalog. Remaining images are dropped
 *  (the URLs stay in staged JSON if ever needed). */
const MAX_IMAGE_FETCHES = 30;

export async function commitImportAction(input: unknown): Promise<CommitResult> {
  const g = await requireAdmin();
  if (!g.ok) return { ok: false, error: g.error };
  const op = g.membership.operator;
  const p = CommitInput.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "Invalid import." };

  const job = await getImportJob(op.id, p.data.jobId);
  if (!job) return { ok: false, error: "Import not found." };
  if (job.status === "committed") return { ok: false, error: "This import was already committed." };
  if (job.status !== "review") return { ok: false, error: "This import isn't ready to commit." };

  const items = p.data.items;
  const [total, liveNow] = await Promise.all([
    countItems(op.id),
    countItems(op.id, { activeOnly: true }),
  ]);
  if (total + items.length > MAX_TOTAL_ITEMS) {
    return { ok: false, error: `This would exceed the ${MAX_TOTAL_ITEMS}-item catalog limit.` };
  }
  // Live-item cap: activate what fits, import the rest hidden — never truncate.
  const cap = planCapabilities(op).maxItems;
  const activeFlags = planActivation(items.map((i) => i.active), liveNow, cap);

  let imagesCopied = 0;
  let fetchBudget = MAX_IMAGE_FETCHES;
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    const images: string[] = [];
    for (const url of it.images.slice(0, 3)) {
      if (fetchBudget <= 0) break;
      fetchBudget--;
      const copied = await ingestImage(op.id, url);
      if (copied) {
        images.push(copied);
        imagesCopied++;
      }
    }
    await createItem({
      operatorId: op.id,
      name: it.name,
      description: it.description,
      category: it.category,
      quantity: it.quantity,
      basePrice: it.basePrice,
      priceUnit: it.priceUnit,
      footprint: it.footprint,
      powerRequired: it.powerRequired,
      images,
      active: activeFlags[i],
    });
  }

  await updateImportJob(op.id, p.data.jobId, { status: "committed" });
  revalidatePath("/inventory");
  const live = activeFlags.filter(Boolean).length;
  return { ok: true, imported: items.length, live, hidden: items.length - live, imagesCopied };
}
