"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, CastleTurret, CheckCircle, CircleNotch, FileCsv, Sparkle, Warning } from "@phosphor-icons/react/dist/ssr";
import type { StagedItem } from "@/lib/import/schema";
import { CATS } from "@/components/operator/inventory/shared";
import {
  commitImportAction,
  processImportChunkAction,
  startImportAction,
} from "@/app/(operator)/inventory/import/actions";

type Phase =
  | { name: "pick"; error: string | null }
  | { name: "processing"; jobPhase: "crawl" | "extract" | "enrich"; done: number; total: number; pages: number; items: number }
  | { name: "stalled"; jobId: string }
  | { name: "review"; jobId: string; warnings: string[] }
  | { name: "done"; imported: number; live: number; hidden: number; skipped: number };

/** Watchdog per step call: the longest legitimate step (a retried enrich
 *  chunk) runs ~90s, so past this the call is presumed wedged. The server
 *  side uses optimistic locking, so resuming while the original call is
 *  somehow still alive can never double-apply a chunk. */
const STEP_TIMEOUT_MS = 180_000;

const PHASE_LABEL = {
  crawl: (p: { pages: number }) => `Reading your website… ${p.pages} pages so far`,
  extract: (p: { done: number; total: number }) => `Reading your items… ${p.done} of ${p.total} batches`,
  enrich: (p: { done: number; total: number }) =>
    `Matching photos and descriptions… ${p.done} of ${p.total} batches`,
};

const PHASE_ORDER = ["crawl", "extract", "enrich"] as const;

/** Something to smile at while the batches grind. Rotates every few seconds. */
const QUIPS = [
  "Unfolding the bounce houses…",
  "Counting every chair… twice.",
  "Checking the blowers for spiders…",
  "Staking down the tents…",
  "Measuring slides in actual feet…",
  "Politely knocking on your old website's door…",
  "Rolling up the extension cords…",
  "Double-checking the cotton candy supply…",
  "Finding the most flattering photo of every castle…",
  "Writing descriptions that don't sound like a robot…",
  "Inflating expectations…",
  "Asking the popcorn machine to behave…",
  "Untangling the anchor straps…",
  "Reading the fine print… kidding, there isn't any.",
];

/** One staged item plus its review state (edits live client-side; commit
 *  re-validates everything server-side). */
interface ReviewRow extends StagedItem {
  include: boolean;
}

/** Review-only preview hotlinked from the operator's old site (commit copies
 *  the file into our storage). Scraped URLs can be dead or hotlink-protected,
 *  so a load failure falls back to the placeholder square instead of the
 *  browser's broken-image icon. */
function Thumb({ src }: { src: string | undefined }) {
  const [broken, setBroken] = useState(false);
  if (!src || broken) return <span aria-hidden className="h-9 w-9 rounded-lg bg-sand/50" />;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      onError={() => setBroken(true)}
      className="h-9 w-9 rounded-lg border border-sand-line object-cover"
    />
  );
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
  const [showAllWarnings, setShowAllWarnings] = useState(false);
  const [quip, setQuip] = useState(() => Math.floor(Math.random() * QUIPS.length));
  const processing = phase.name === "processing";
  useEffect(() => {
    if (!processing) return;
    const t = setInterval(() => setQuip((q) => q + 1), 4500);
    return () => clearInterval(t);
  }, [processing]);
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
    setPhase({ name: "processing", jobPhase: siteUrl.trim() ? "crawl" : "extract", done: 0, total: 0, pages: 0, items: 0 });
    await drive(started.jobId);
  }

  /** Drive the job one bounded step per call; each call updates progress. Also
   *  the resume path after a stall — safe to re-enter thanks to the server's
   *  optimistic locking. */
  async function drive(jobId: string) {
    for (;;) {
      const step = await Promise.race([
        processImportChunkAction(jobId),
        new Promise<"stalled">((resolve) => setTimeout(() => resolve("stalled"), STEP_TIMEOUT_MS)),
      ]);
      if (step === "stalled") {
        setPhase({ name: "stalled", jobId });
        return;
      }
      if (!step.ok) {
        setPhase({ name: "pick", error: step.error });
        return;
      }
      if (step.status === "review") {
        // Make the Live checkboxes tell the truth up front: pre-select Live on
        // only as many items as the plan has slots for — the checkboxes ARE the
        // slot picker, and commit does exactly what the screen shows.
        let liveLeft = itemLimit === null ? Infinity : Math.max(0, itemLimit - liveNow);
        setRows(
          step.staged.map((s) => {
            const live = s.active && liveLeft > 0;
            if (live) liveLeft--;
            return { ...s, active: live, include: true };
          }),
        );
        setPhase({ name: "review", jobId, warnings: step.warnings });
        return;
      }
      setPhase({
        name: "processing",
        jobPhase: step.phase,
        done: step.doneChunks,
        total: step.totalChunks,
        pages: step.pagesCrawled,
        items: step.staged.length,
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
    setPhase({ name: "done", imported: res.imported, live: res.live, hidden: res.hidden, skipped: res.skipped });
  }

  const edit = (i: number, patch: Partial<ReviewRow>) =>
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  const includedCount = rows.filter((r) => r.include).length;
  const wantLive = rows.filter((r) => r.include && r.active).length;
  const slots = itemLimit === null ? Infinity : Math.max(0, itemLimit - liveNow);
  const liveFull = slots !== Infinity && wantLive >= slots;

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
          <div className="mx-auto flex max-w-xl flex-col items-center gap-5 py-12 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-tint text-brand motion-safe:animate-bounce">
              <CastleTurret size={34} weight="fill" />
            </div>

            {/* Step checklist — only the steps this import actually runs. */}
            <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
              {[
                ...(siteUrl.trim() ? [{ key: "crawl" as const, label: "Read your website" }] : []),
                ...(file ? [{ key: "extract" as const, label: "Read your items" }] : []),
                ...(siteUrl.trim() ? [{ key: "enrich" as const, label: "Photos & descriptions" }] : []),
              ].map((s) => {
                const state =
                  PHASE_ORDER.indexOf(s.key) < PHASE_ORDER.indexOf(phase.jobPhase)
                    ? "done"
                    : s.key === phase.jobPhase
                      ? "active"
                      : "pending";
                return (
                  <span
                    key={s.key}
                    className={`flex items-center gap-1.5 text-[13px] font-bold ${
                      state === "done" ? "text-teal" : state === "active" ? "text-ink" : "text-ink-faint"
                    }`}
                  >
                    {state === "done" ? (
                      <CheckCircle size={16} weight="fill" />
                    ) : state === "active" ? (
                      <CircleNotch size={16} weight="bold" className="animate-spin" />
                    ) : (
                      <span className="h-2 w-2 rounded-full bg-sand" />
                    )}
                    {s.label}
                  </span>
                );
              })}
            </div>

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
            <div>
              <p className="text-sm font-semibold text-ink-soft">{PHASE_LABEL[phase.jobPhase](phase)}</p>
              {phase.items > 0 || phase.pages > 0 ? (
                <p className="mt-0.5 text-[13px] font-semibold text-ink-mute">
                  {[
                    phase.pages > 0 ? `${phase.pages} pages found` : null,
                    phase.items > 0 ? `${phase.items} items so far` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              ) : null}
            </div>

            <p aria-live="polite" className="text-[13px] font-medium italic text-ink-mute">
              {QUIPS[quip % QUIPS.length]}
            </p>
            <p className="text-[12px] font-medium text-ink-faint">
              This takes a few minutes — keep this tab open.
            </p>
          </div>
        ) : null}

        {phase.name === "stalled" ? (
          <div className="mx-auto flex max-w-xl flex-col items-center gap-3 py-14 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-tint text-amber-deep">
              <Warning size={24} weight="fill" />
            </div>
            <h2 className="font-display text-xl font-bold text-ink">Taking longer than expected</h2>
            <p className="max-w-md text-sm font-medium text-ink-mute">
              One step didn&apos;t come back in time. Your progress is saved — picking up where it
              left off is safe.
            </p>
            <div className="mt-1 flex gap-2">
              <button
                onClick={() => {
                  const { jobId } = phase;
                  setPhase({ name: "processing", jobPhase: "crawl", done: 0, total: 0, pages: 0, items: 0 });
                  void drive(jobId);
                }}
                className="rounded-full bg-brand px-6 py-2.5 text-sm font-bold text-white hover:bg-brand-deep"
              >
                Keep going
              </button>
              <button
                onClick={() => setPhase({ name: "pick", error: null })}
                className="rounded-full border border-sand-line bg-white px-6 py-2.5 text-sm font-bold text-ink-soft hover:border-sand"
              >
                Start over
              </button>
            </div>
          </div>
        ) : null}

        {phase.name === "review" ? (
          <div className="flex flex-col gap-4">
            {phase.warnings.length > 0 ? (
              <div className="rounded-xl bg-amber-tint/60 px-4 py-3">
                <p className="flex items-start gap-2 text-[13.5px] font-semibold text-amber-deep">
                  <Warning size={16} weight="fill" className="mt-0.5 flex-shrink-0" />
                  {phase.warnings.length === 1
                    ? phase.warnings[0]
                    : `${phase.warnings.length} things to double-check from this import. Item-specific flags are shown on each item below.`}
                </p>
                {phase.warnings.length > 1 ? (
                  <>
                    {(showAllWarnings ? phase.warnings : phase.warnings.slice(0, 2)).map((w) => (
                      <p key={w} className="mt-1.5 pl-6 text-[13px] font-medium text-amber-deep">
                        {w}
                      </p>
                    ))}
                    {phase.warnings.length > 2 ? (
                      <button
                        onClick={() => setShowAllWarnings((v) => !v)}
                        className="mt-1.5 pl-6 text-[13px] font-bold text-amber-deep underline"
                      >
                        {showAllWarnings ? "Show fewer" : `Show all ${phase.warnings.length}`}
                      </button>
                    ) : null}
                  </>
                ) : null}
              </div>
            ) : null}
            {itemLimit !== null && rows.length > slots ? (
              slots === 0 ? (
                <p className="rounded-xl bg-brand-tint/50 px-4 py-2.5 text-[13.5px] font-semibold text-ink-soft">
                  <span className="font-bold text-ink">
                    All {itemLimit} of your plan&apos;s live slots are already used
                  </span>{" "}
                  by items in your inventory, so everything here imports hidden — saved and
                  editable. After importing, swap any of them live from your Inventory page, or
                  upgrade for an unlimited live catalog.
                </p>
              ) : (
                <p className="rounded-xl bg-brand-tint/50 px-4 py-2.5 text-[13.5px] font-semibold text-ink-soft">
                  <span className="font-bold text-ink">
                    {wantLive} of {slots} live {slots === 1 ? "slot" : "slots"} used.
                  </span>{" "}
                  Your plan shows {itemLimit} items on your storefront at a time — use the Live
                  checkboxes to pick which ones. Everything else imports hidden: saved, editable, and
                  swappable into a live slot anytime.
                </p>
              )
            ) : null}

            {/* Confidence legend — the chips triage the review. */}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-1 text-[12.5px] font-medium text-ink-mute">
              <span className="font-bold text-ink-soft">How sure we are about each item:</span>
              <span className="flex items-center gap-1.5">
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold uppercase ${CONFIDENCE_STYLE.high}`}>high</span>
                read directly from your data
              </span>
              <span className="flex items-center gap-1.5">
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold uppercase ${CONFIDENCE_STYLE.medium}`}>medium</span>
                some interpretation — see the note
              </span>
              <span className="flex items-center gap-1.5">
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold uppercase ${CONFIDENCE_STYLE.low}`}>low</span>
                a guess was needed — check these first
              </span>
            </div>

            <div className="overflow-x-auto">
              <div className="flex min-w-[56rem] flex-col gap-2">
              {rows.map((r, i) => (
                <div
                  key={i}
                  className={`rounded-2xl border bg-white p-3 transition-opacity ${
                    r.include ? "border-sand-line" : "border-sand-line opacity-45"
                  }`}
                >
                  {/* Fixed column tracks so every row's controls align; the
                      thumbnail cell is always reserved, image or not. */}
                  <div className="grid grid-cols-[1rem_2.25rem_minmax(0,1fr)_8.5rem_4rem_7rem_7rem_3.5rem_4.5rem] items-center gap-2">
                    <input
                      type="checkbox"
                      checked={r.include}
                      onChange={(e) => edit(i, { include: e.target.checked })}
                      className="h-4 w-4 accent-brand"
                      aria-label={`Include ${r.name}`}
                    />
                    <Thumb src={r.images[0]} />
                    <input
                      value={r.name}
                      onChange={(e) => edit(i, { name: e.target.value })}
                      className="input !py-2 text-sm font-bold"
                    />
                    <select
                      value={r.category}
                      onChange={(e) => edit(i, { category: e.target.value as StagedItem["category"] })}
                      className="input !py-2 text-sm"
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
                      className="input !py-2 text-sm"
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
                        className="input w-full !py-2 text-sm"
                        aria-label="Price"
                      />
                    </div>
                    <select
                      value={r.priceUnit}
                      onChange={(e) => edit(i, { priceUnit: e.target.value as StagedItem["priceUnit"] })}
                      className="input !py-2 text-sm"
                    >
                      <option value="per_day">Per day</option>
                      <option value="per_hour">Per hour</option>
                      <option value="flat">Flat</option>
                    </select>
                    <label
                      className={`flex items-center gap-1.5 text-[13px] font-bold ${
                        !r.active && liveFull ? "text-ink-faint" : "text-ink-soft"
                      }`}
                      title={
                        !r.active && liveFull
                          ? slots === 0
                            ? "Your plan's live slots are all used by existing items — import as hidden, then swap from Inventory."
                            : "All live slots are used — uncheck another item first."
                          : undefined
                      }
                    >
                      <input
                        type="checkbox"
                        checked={r.active}
                        disabled={!r.active && liveFull}
                        onChange={(e) => edit(i, { active: e.target.checked })}
                        className="h-4 w-4 accent-brand disabled:opacity-40"
                      />
                      Live
                    </label>
                    <span
                      className={`justify-self-center rounded-full px-2 py-0.5 text-center text-[10px] font-extrabold uppercase ${CONFIDENCE_STYLE[r.confidence]}`}
                    >
                      {r.confidence}
                    </span>
                  </div>
                  {r.notes ? (
                    <p className="mt-1.5 pl-[4.25rem] text-[12.5px] font-medium text-ink-mute">{r.notes}</p>
                  ) : null}
                </div>
              ))}
              </div>
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
              {phase.hidden > 0 ? ` · ${phase.hidden} hidden (swap or upgrade anytime)` : ""}
              {phase.skipped > 0 ? ` · ${phase.skipped} skipped (already in your inventory)` : ""}.
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
