"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, FileCsv, Sparkle, Warning } from "@phosphor-icons/react/dist/ssr";
import type { StagedItem } from "@/lib/import/schema";
import { CATS } from "@/components/operator/inventory/shared";
import {
  commitImportAction,
  processImportChunkAction,
  startImportAction,
} from "@/app/(operator)/inventory/import/actions";

type Phase =
  | { name: "pick"; error: string | null }
  | { name: "processing"; jobPhase: "crawl" | "extract" | "enrich"; done: number; total: number; pages: number }
  | { name: "review"; jobId: string; warnings: string[] }
  | { name: "done"; imported: number; live: number; hidden: number };

const PHASE_LABEL = {
  crawl: (p: { pages: number }) => `Reading your website… ${p.pages} pages so far`,
  extract: (p: { done: number; total: number }) => `Reading your items… ${p.done} of ${p.total} batches`,
  enrich: (p: { done: number; total: number }) =>
    `Matching photos and descriptions… ${p.done} of ${p.total} batches`,
};

/** One staged item plus its review state (edits live client-side; commit
 *  re-validates everything server-side). */
interface ReviewRow extends StagedItem {
  include: boolean;
}

const CONFIDENCE_STYLE: Record<StagedItem["confidence"], string> = {
  high: "bg-teal-tint text-teal",
  medium: "bg-amber-tint text-amber-deep",
  low: "bg-coral/15 text-coral",
};

export function ImportWizard({
  liveNow,
  itemLimit,
}: {
  liveNow: number;
  /** Plan cap on LIVE items; null = unlimited. */
  itemLimit: number | null;
}) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>({ name: "pick", error: null });
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [committing, setCommitting] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [siteUrl, setSiteUrl] = useState("");
  const [siteConfirmed, setSiteConfirmed] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const canStart = file !== null || (siteUrl.trim() !== "" && siteConfirmed);

  async function start() {
    const csv = file ? await file.text() : null;
    const started = await startImportAction({
      sourceName: file?.name ?? null,
      csv,
      url: siteUrl.trim() || null,
      siteConfirmed,
    });
    if (!started.ok) {
      setPhase({ name: "pick", error: started.error });
      return;
    }
    setPhase({ name: "processing", jobPhase: siteUrl.trim() ? "crawl" : "extract", done: 0, total: 0, pages: 0 });
    // Drive the job one bounded step per call; each call updates progress.
    for (;;) {
      const step = await processImportChunkAction(started.jobId);
      if (!step.ok) {
        setPhase({ name: "pick", error: step.error });
        return;
      }
      if (step.status === "review") {
        setRows(step.staged.map((s) => ({ ...s, include: true })));
        setPhase({ name: "review", jobId: started.jobId, warnings: step.warnings });
        return;
      }
      setPhase({
        name: "processing",
        jobPhase: step.phase,
        done: step.doneChunks,
        total: step.totalChunks,
        pages: step.pagesCrawled,
      });
    }
  }

  async function commit(jobId: string) {
    setCommitting(true);
    const included = rows.filter((r) => r.include).map(({ include: _include, ...item }) => item);
    const res = await commitImportAction({ jobId, items: included });
    setCommitting(false);
    if (!res.ok) {
      setPhase({ name: "review", jobId, warnings: [res.error] });
      return;
    }
    setPhase({ name: "done", imported: res.imported, live: res.live, hidden: res.hidden });
  }

  const edit = (i: number, patch: Partial<ReviewRow>) =>
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  const includedCount = rows.filter((r) => r.include).length;
  const wantLive = rows.filter((r) => r.include && r.active).length;
  const slots = itemLimit === null ? Infinity : Math.max(0, itemLimit - liveNow);

  return (
    <div className="flex w-full flex-col">
      <div className="flex items-center gap-3 border-b border-sand px-5 py-5 lg:px-8 lg:py-6">
        <button
          onClick={() => router.push("/inventory")}
          className="flex h-9 w-9 items-center justify-center rounded-full border border-sand-line text-ink-soft hover:border-sand"
          aria-label="Back to inventory"
        >
          <ArrowLeft size={16} weight="bold" />
        </button>
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-ink lg:text-[28px]">
            Import inventory
          </h1>
          <p className="mt-0.5 text-sm font-medium text-ink-mute">
            Upload a spreadsheet from your old software — any column layout works.
          </p>
        </div>
      </div>

      <div className="px-5 py-6 lg:px-8">
        {phase.name === "pick" ? (
          <div className="mx-auto flex max-w-xl flex-col gap-4 py-6">
            <div className="flex flex-col items-center gap-3 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-tint text-brand">
                <FileCsv size={28} weight="fill" />
              </div>
              <h2 className="font-display text-xl font-bold text-ink">Bring your catalog over</h2>
              <p className="max-w-md text-sm font-medium text-ink-mute">
                Upload a spreadsheet from your old software, paste your current website, or both —
                the sheet brings quantities, your site brings photos and descriptions. You review
                every item before anything is added.
              </p>
              {phase.error ? (
                <p className="rounded-xl bg-coral/10 px-4 py-2 text-sm font-semibold text-coral">
                  {phase.error}
                </p>
              ) : null}
            </div>

            <div className="flex flex-col gap-3 rounded-2xl border border-sand-line bg-white p-4">
              <input
                ref={fileRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
              <button
                onClick={() => fileRef.current?.click()}
                className="flex items-center justify-between rounded-xl border border-sand-line px-4 py-3 text-left text-sm font-bold text-ink-soft hover:border-sand"
              >
                <span className="flex items-center gap-2">
                  <FileCsv size={18} weight="bold" />
                  {file ? file.name : "Choose a CSV file"}
                </span>
                {file ? (
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => {
                      e.stopPropagation();
                      setFile(null);
                      if (fileRef.current) fileRef.current.value = "";
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.stopPropagation();
                        setFile(null);
                        if (fileRef.current) fileRef.current.value = "";
                      }
                    }}
                    className="text-[12px] font-bold text-ink-mute underline"
                  >
                    remove
                  </span>
                ) : null}
              </button>
              <input
                type="url"
                value={siteUrl}
                onChange={(e) => setSiteUrl(e.target.value)}
                placeholder="Your current website, e.g. https://yourbusiness.com/rentals"
                className="input"
              />
              {siteUrl.trim() ? (
                <label className="flex items-start gap-2 text-[13px] font-semibold text-ink-soft">
                  <input
                    type="checkbox"
                    checked={siteConfirmed}
                    onChange={(e) => setSiteConfirmed(e.target.checked)}
                    className="mt-0.5 h-4 w-4 accent-brand"
                  />
                  This is my business&apos;s website and I have the right to use its content —
                  photos and text will be imported for my catalog.
                </label>
              ) : null}
              <button
                onClick={() => void start()}
                disabled={!canStart}
                className="flex items-center justify-center gap-2 rounded-full bg-brand px-6 py-3 text-sm font-bold text-white hover:bg-brand-deep disabled:opacity-50"
              >
                <Sparkle size={16} weight="fill" /> Start import
              </button>
            </div>
          </div>
        ) : null}

        {phase.name === "processing" ? (
          <div className="mx-auto flex max-w-xl flex-col items-center gap-4 py-14 text-center">
            <div className="h-2 w-64 overflow-hidden rounded-full bg-sand">
              <div
                className={`h-full rounded-full bg-brand transition-all duration-500 ${
                  phase.jobPhase === "crawl" ? "animate-pulse" : ""
                }`}
                style={{
                  width:
                    phase.jobPhase === "crawl" || phase.total === 0
                      ? "30%"
                      : `${Math.max(6, Math.round((phase.done / phase.total) * 100))}%`,
                }}
              />
            </div>
            <p className="text-sm font-semibold text-ink-soft">{PHASE_LABEL[phase.jobPhase](phase)}</p>
            <p className="text-[13px] font-medium text-ink-mute">
              This takes a few minutes — keep this tab open.
            </p>
          </div>
        ) : null}

        {phase.name === "review" ? (
          <div className="flex flex-col gap-4">
            {phase.warnings.map((w) => (
              <p
                key={w}
                className="flex items-start gap-2 rounded-xl bg-amber-tint/60 px-4 py-2.5 text-[13.5px] font-semibold text-amber-deep"
              >
                <Warning size={16} weight="fill" className="mt-0.5 flex-shrink-0" /> {w}
              </p>
            ))}
            {itemLimit !== null && wantLive > slots ? (
              <p className="rounded-xl bg-brand-tint/50 px-4 py-2.5 text-[13.5px] font-semibold text-ink-soft">
                Your plan has {slots} live-item {slots === 1 ? "slot" : "slots"} left — the first{" "}
                {slots} live items import live, the rest import hidden (saved and swappable
                anytime).
              </p>
            ) : null}

            <div className="flex flex-col gap-2">
              {rows.map((r, i) => (
                <div
                  key={i}
                  className={`rounded-2xl border bg-white p-3 transition-opacity ${
                    r.include ? "border-sand-line" : "border-sand-line opacity-45"
                  }`}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      type="checkbox"
                      checked={r.include}
                      onChange={(e) => edit(i, { include: e.target.checked })}
                      className="h-4 w-4 accent-brand"
                      aria-label={`Include ${r.name}`}
                    />
                    {r.images[0] ? (
                      // Review-only preview straight from the operator's old site;
                      // commit copies the file into our own storage.
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={r.images[0]}
                        alt=""
                        className="h-9 w-9 flex-shrink-0 rounded-lg border border-sand-line object-cover"
                      />
                    ) : null}
                    <input
                      value={r.name}
                      onChange={(e) => edit(i, { name: e.target.value })}
                      className="input min-w-44 flex-1 !py-2 text-sm font-bold"
                    />
                    <select
                      value={r.category}
                      onChange={(e) => edit(i, { category: e.target.value as StagedItem["category"] })}
                      className="input w-36 !py-2 text-sm"
                    >
                      {CATS.map((c) => (
                        <option key={c.value} value={c.value}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                    <input
                      type="number"
                      min={0}
                      value={r.quantity}
                      onChange={(e) => edit(i, { quantity: Math.max(0, Math.round(Number(e.target.value) || 0)) })}
                      className="input w-16 !py-2 text-sm"
                      aria-label="Quantity"
                    />
                    <div className="flex items-center gap-1">
                      <span className="text-sm font-bold text-ink-mute">$</span>
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        value={(r.basePrice / 100).toString()}
                        onChange={(e) =>
                          edit(i, { basePrice: Math.max(0, Math.round(Number(e.target.value) * 100) || 0) })
                        }
                        className="input w-24 !py-2 text-sm"
                        aria-label="Price"
                      />
                    </div>
                    <select
                      value={r.priceUnit}
                      onChange={(e) => edit(i, { priceUnit: e.target.value as StagedItem["priceUnit"] })}
                      className="input w-28 !py-2 text-sm"
                    >
                      <option value="per_day">Per day</option>
                      <option value="per_hour">Per hour</option>
                      <option value="flat">Flat</option>
                    </select>
                    <label className="flex items-center gap-1.5 text-[13px] font-bold text-ink-soft">
                      <input
                        type="checkbox"
                        checked={r.active}
                        onChange={(e) => edit(i, { active: e.target.checked })}
                        className="h-4 w-4 accent-brand"
                      />
                      Live
                    </label>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold uppercase ${CONFIDENCE_STYLE[r.confidence]}`}
                    >
                      {r.confidence}
                    </span>
                  </div>
                  {r.notes ? (
                    <p className="mt-1.5 pl-6 text-[12.5px] font-medium text-ink-mute">{r.notes}</p>
                  ) : null}
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between rounded-2xl border border-sand-line bg-white px-4 py-3">
              <p className="text-sm font-semibold text-ink-soft">
                {includedCount} of {rows.length} items selected
              </p>
              <button
                onClick={() => commit(phase.jobId)}
                disabled={committing || includedCount === 0}
                className="rounded-full bg-brand px-6 py-2.5 text-sm font-bold text-white hover:bg-brand-deep disabled:opacity-50"
              >
                {committing ? "Importing…" : `Import ${includedCount} items`}
              </button>
            </div>
          </div>
        ) : null}

        {phase.name === "done" ? (
          <div className="mx-auto flex max-w-xl flex-col items-center gap-3 py-14 text-center">
            <h2 className="font-display text-xl font-bold text-ink">
              Imported {phase.imported} items
            </h2>
            <p className="text-sm font-medium text-ink-mute">
              {phase.live} live on your storefront
              {phase.hidden > 0 ? ` · ${phase.hidden} hidden (swap or upgrade anytime)` : ""}.
            </p>
            <button
              onClick={() => router.push("/inventory")}
              className="mt-2 rounded-full bg-brand px-6 py-2.5 text-sm font-bold text-white hover:bg-brand-deep"
            >
              View your catalog
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
