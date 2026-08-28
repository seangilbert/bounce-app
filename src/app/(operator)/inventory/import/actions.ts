"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/operator/session";
import { checkRateLimit } from "@/lib/rate-limit";
import { planCapabilities } from "@/lib/plans";
import { countItems, createItem, listItems } from "@/lib/inventory/repo";
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
  | { ok: true; imported: number; live: number; hidden: number; skipped: number; imagesCopied: number }
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

/** One retry for model calls: a transient bad generation (malformed JSON,
 *  network blip) usually succeeds on the second attempt, and a chunk is cheap
 *  to redo relative to failing (extract) or skipping pages (enrich). */
async function retryOnce<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch {
    return await fn();
  }
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

  // Optimistic locking on every step write: a stall-retry from the wizard can
  // race the original (still-running) call, and both must not apply the same
  // chunk twice. The loser re-reads and reports the winner's state.
  const apply = async (patch: Parameters<typeof updateImportJob>[2]): Promise<ChunkResult> => {
    const applied = await updateImportJob(op.id, jobId, patch, { ifUpdatedAt: job.updatedAt });
    if (applied) return asResult(job, patch);
    const fresh = await getImportJob(op.id, jobId);
    return fresh ? asResult(fresh, {}) : { ok: false, error: "Import not found." };
  };

  try {
    if (job.phase === "crawl") {
      if (!job.crawlState) throw new Error("Crawl state missing.");
      const { state, done } = await crawlStep(job.crawlState);
      if (!done) return apply({ crawlState: state });
      if (state.pages.length === 0) {
        throw new Error("We couldn't read any pages from that website.");
      }
      // Crawl finished — hand off to extraction (if there's a sheet) or
      // straight to enrichment (URL-only import).
      const nextPhase: ImportJobPhase = job.sourceCsv ? "extract" : "enrich";
      const totalChunks = job.sourceCsv
        ? Math.ceil((parseCsv(job.sourceCsv).length - 1) / IMPORT_CHUNK_ROWS)
        : Math.ceil(state.pages.length / ENRICH_CHUNK_PAGES);
      return apply({ crawlState: state, phase: nextPhase, doneChunks: 0, totalChunks });
    }

    if (job.phase === "extract") {
      if (!job.sourceCsv) throw new Error("Spreadsheet missing.");
      const rows = parseCsv(job.sourceCsv);
      const start = 1 + job.doneChunks * IMPORT_CHUNK_ROWS;
      const result = await retryOnce(() =>
        extractChunk(rows[0], rows.slice(start, start + IMPORT_CHUNK_ROWS), start),
      );
      const staged = [...job.staged, ...result.items];
      const warnings = [...job.warnings, ...result.warnings];
      const doneChunks = job.doneChunks + 1;
      const finished = doneChunks >= job.totalChunks;
      const pages = job.crawlState?.pages ?? [];
      return apply(
        finished && job.sourceUrl && pages.length
          ? {
              staged,
              warnings,
              phase: "enrich" as const,
              doneChunks: 0,
              totalChunks: Math.ceil(pages.length / ENRICH_CHUNK_PAGES),
            }
          : { staged, warnings, doneChunks, status: finished ? ("review" as const) : ("processing" as const) },
      );
    }

    // phase === "enrich" — additive polish on top of already-staged items, so
    // a chunk that fails (e.g. truncated output) becomes a warning and the job
    // moves on; only crawl/extract failures are fatal.
    const pages = job.crawlState?.pages ?? [];
    const start = job.doneChunks * ENRICH_CHUNK_PAGES;
    const chunk = pages.slice(start, start + ENRICH_CHUNK_PAGES);
    let staged = job.staged;
    const warnings = [...job.warnings];
    try {
      const enrichment = await retryOnce(() => enrichChunk(job.staged, chunk, job.warnings));
      staged = applyEnrichment(job.staged, enrichment);
      warnings.push(...enrichment.warnings.filter((w) => !warnings.includes(w)));
    } catch (e) {
      const raw = e instanceof Error ? e.message : "processing failed";
      // Parser/SDK internals are developer noise — say what it means instead.
      const why = /parse|JSON/i.test(raw)
        ? "we couldn't read the results for these pages (tried twice)"
        : raw;
      warnings.push(
        `Some website pages couldn't be processed, so photos or descriptions from them may be missing: ${chunk
          .map((p) => p.url)
          .join(", ")} — ${why}.`,
      );
    }
    const doneChunks = job.doneChunks + 1;
    const finished = doneChunks >= job.totalChunks;
    return apply({
      staged,
      warnings,
      doneChunks,
      status: finished ? ("review" as const) : ("processing" as const),
    });
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

  // Rerun-safe: an item whose name the operator already has is skipped, so
  // importing the same sheet twice can't duplicate the catalog.
  const existing = new Set((await listItems(op.id)).map((i) => i.name.trim().toLowerCase()));
  const items = p.data.items.filter((i) => !existing.has(i.name.trim().toLowerCase()));
  const skipped = p.data.items.length - items.length;
  if (items.length === 0) {
    await updateImportJob(op.id, p.data.jobId, { status: "committed" });
    return { ok: true, imported: 0, live: 0, hidden: 0, skipped, imagesCopied: 0 };
  }
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
  return { ok: true, imported: items.length, live, hidden: items.length - live, skipped, imagesCopied };
}
