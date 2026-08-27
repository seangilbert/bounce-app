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
  ENRICH_CHUNK_PAGES,
  IMPORT_CHUNK_ROWS,
  StagedItemSchema,
  applyEnrichment,
  parseCsv,
  planActivation,
  type StagedItem,
} from "@/lib/import/schema";
import { extractChunk, enrichChunk } from "@/lib/import/extract";
import { assertPublicSiteUrl, crawlStep, initialCrawlState } from "@/lib/import/crawl";
import {
  createImportJob,
  getImportJob,
  updateImportJob,
  type ImportJob,
  type ImportJobPhase,
} from "@/lib/import/repo";

export type StartResult = { ok: true; jobId: string } | { ok: false; error: string };

export type ChunkResult =
  | {
      ok: true;
      status: "processing" | "review";
      phase: ImportJobPhase;
      doneChunks: number;
      totalChunks: number;
      pagesCrawled: number;
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
  csv: z.string().min(1).max(900_000).nullable(),
  url: z.string().trim().min(1).max(500).nullable(),
  /** The operator's confirmation that the URL is their own site and they have
   *  rights to its content — required for any crawl (see the import plan's
   *  legal posture). The wizard gates on it; the server refuses without it. */
  siteConfirmed: z.boolean().optional(),
});

export async function startImportAction(input: unknown): Promise<StartResult> {
  const g = await requireAdmin();
  if (!g.ok) return { ok: false, error: g.error };
  const op = g.membership.operator;
  const p = StartInput.safeParse(input);
  if (!p.success) return { ok: false, error: "Could not read that import request." };
  const { csv, url } = p.data;
  if (!csv && !url) return { ok: false, error: "Add a spreadsheet, a website address, or both." };

  let csvChunks = 0;
  if (csv) {
    const rows = parseCsv(csv);
    const dataRows = rows.length - 1;
    if (dataRows < 1) return { ok: false, error: "That file has a header but no data rows." };
    if (dataRows > MAX_TOTAL_ITEMS) {
      return { ok: false, error: `That's ${dataRows} rows — imports are limited to ${MAX_TOTAL_ITEMS} items.` };
    }
    csvChunks = Math.ceil(dataRows / IMPORT_CHUNK_ROWS);
  }

  let siteUrl: string | null = null;
  if (url) {
    if (!p.data.siteConfirmed) {
      return { ok: false, error: "Please confirm the website is yours before importing from it." };
    }
    try {
      siteUrl = (await assertPublicSiteUrl(url)).href;
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "That website address didn't work." };
    }
  }

  const rl = await checkRateLimit(`import:${op.id}`, 10, 24 * 60 * 60 * 1000);
  if (!rl.allowed) return { ok: false, error: "Import limit reached for today — try again tomorrow." };

  const job = await createImportJob({
    operatorId: op.id,
    sourceName: p.data.sourceName,
    sourceCsv: csv,
    sourceUrl: siteUrl,
    phase: siteUrl ? "crawl" : "extract",
    crawlState: siteUrl ? initialCrawlState(siteUrl) : null,
    totalChunks: siteUrl ? 0 : csvChunks,
  });
  return { ok: true, jobId: job.id };
}

const asResult = (job: ImportJob, patch: Partial<ImportJob>): ChunkResult => {
  const j = { ...job, ...patch };
  return {
    ok: true,
    status: j.status === "review" ? "review" : "processing",
    phase: j.phase,
    doneChunks: j.doneChunks,
    totalChunks: j.totalChunks,
    pagesCrawled: j.crawlState?.pages.length ?? 0,
    staged: j.staged,
    warnings: j.warnings,
  };
};

/** Process the job's next pending unit of work — one bounded step (a crawl
 *  batch or a single model call) per action invocation, so any hosting plan's
 *  duration limit holds; the wizard loops until review. */
export async function processImportChunkAction(jobId: string): Promise<ChunkResult> {
  const g = await requireAdmin();
  if (!g.ok) return { ok: false, error: g.error };
  const op = g.membership.operator;

  const job = await getImportJob(op.id, jobId);
  if (!job) return { ok: false, error: "Import not found." };
  if (job.status === "failed") return { ok: false, error: job.error ?? "Import failed." };
  if (job.status !== "processing") return asResult(job, {});

  try {
    if (job.phase === "crawl") {
      if (!job.crawlState) throw new Error("Crawl state missing.");
      const { state, done } = await crawlStep(job.crawlState);
      if (!done) {
        await updateImportJob(op.id, jobId, { crawlState: state });
        return asResult(job, { crawlState: state });
      }
      if (state.pages.length === 0) {
        throw new Error("We couldn't read any pages from that website.");
      }
      // Crawl finished — hand off to extraction (if there's a sheet) or
      // straight to enrichment (URL-only import).
      const nextPhase: ImportJobPhase = job.sourceCsv ? "extract" : "enrich";
      const totalChunks = job.sourceCsv
        ? Math.ceil((parseCsv(job.sourceCsv).length - 1) / IMPORT_CHUNK_ROWS)
        : Math.ceil(state.pages.length / ENRICH_CHUNK_PAGES);
      const patch = { crawlState: state, phase: nextPhase, doneChunks: 0, totalChunks };
      await updateImportJob(op.id, jobId, patch);
      return asResult(job, patch);
    }

    if (job.phase === "extract") {
      if (!job.sourceCsv) throw new Error("Spreadsheet missing.");
      const rows = parseCsv(job.sourceCsv);
      const start = 1 + job.doneChunks * IMPORT_CHUNK_ROWS;
      const result = await extractChunk(rows[0], rows.slice(start, start + IMPORT_CHUNK_ROWS), start);
      const staged = [...job.staged, ...result.items];
      const warnings = [...job.warnings, ...result.warnings];
      const doneChunks = job.doneChunks + 1;
      const finished = doneChunks >= job.totalChunks;
      const pages = job.crawlState?.pages ?? [];
      const patch =
        finished && job.sourceUrl && pages.length
          ? {
              staged,
              warnings,
              phase: "enrich" as const,
              doneChunks: 0,
              totalChunks: Math.ceil(pages.length / ENRICH_CHUNK_PAGES),
            }
          : { staged, warnings, doneChunks, status: finished ? ("review" as const) : ("processing" as const) };
      await updateImportJob(op.id, jobId, patch);
      return asResult(job, patch);
    }

    // phase === "enrich"
    const pages = job.crawlState?.pages ?? [];
    const start = job.doneChunks * ENRICH_CHUNK_PAGES;
    const enrichment = await enrichChunk(job.staged, pages.slice(start, start + ENRICH_CHUNK_PAGES));
    const staged = applyEnrichment(job.staged, enrichment);
    const warnings = [...job.warnings, ...enrichment.warnings];
    const doneChunks = job.doneChunks + 1;
    const finished = doneChunks >= job.totalChunks;
    const patch = {
      staged,
      warnings,
      doneChunks,
      status: finished ? ("review" as const) : ("processing" as const),
    };
    await updateImportJob(op.id, jobId, patch);
    return asResult(job, patch);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Import failed.";
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
const MAX_IMAGE_FETCHES = 60;

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
