"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Tag, Plus, X, CircleNotch, Trash, Percent, CurrencyDollar } from "@phosphor-icons/react/dist/ssr";
import type { Promo } from "@/lib/promos/repo";
import { createPromoAction, updatePromoAction, deletePromoAction } from "@/app/(operator)/promos/actions";

const money = (c: number) => `$${(c / 100).toLocaleString("en-US")}`;

function fmtDate(iso: string | null): string {
  if (!iso) return "";
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

interface Draft {
  code: string;
  kind: "percent" | "fixed";
  value: string; // percent or dollars
  active: boolean;
  minSubtotal: string; // dollars
  usageLimit: string;
  startsOn: string;
  endsOn: string;
}

const emptyDraft: Draft = {
  code: "",
  kind: "percent",
  value: "",
  active: true,
  minSubtotal: "",
  usageLimit: "",
  startsOn: "",
  endsOn: "",
};

function toDraft(p: Promo): Draft {
  return {
    code: p.code,
    kind: p.kind,
    value: p.kind === "percent" ? String(p.value) : String(p.value / 100),
    active: p.active,
    minSubtotal: p.minSubtotalCents ? String(p.minSubtotalCents / 100) : "",
    usageLimit: p.usageLimit != null ? String(p.usageLimit) : "",
    startsOn: p.startsOn ?? "",
    endsOn: p.endsOn ?? "",
  };
}

export function PromosManager({ promos }: { promos: Promo[] }) {
  const [editing, setEditing] = useState<Promo | "new" | null>(null);

  return (
    <div className="mx-auto max-w-3xl px-5 py-6 lg:px-8 lg:py-8">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-ink lg:text-3xl">Promo codes</h1>
          <p className="mt-1 text-sm font-medium text-ink-mute">Discount codes customers enter at checkout.</p>
        </div>
        <button
          onClick={() => setEditing("new")}
          className="flex items-center gap-2 rounded-full bg-brand px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-brand-deep"
        >
          <Plus size={16} weight="bold" /> New code
        </button>
      </div>

      {promos.length === 0 ? (
        <div className="mt-14 flex flex-col items-center gap-3 text-center">
          <Tag size={36} weight="light" className="text-ink-faint" />
          <p className="text-sm font-medium text-ink-mute">No promo codes yet. Create one to offer a discount.</p>
        </div>
      ) : (
        <div className="mt-5 flex flex-col gap-2.5">
          {promos.map((p) => (
            <PromoCard key={p.id} promo={p} onEdit={() => setEditing(p)} />
          ))}
        </div>
      )}

      {editing ? (
        <PromoDrawer
          promo={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </div>
  );
}

function PromoCard({ promo, onEdit }: { promo: Promo; onEdit: () => void }) {
  const off = promo.kind === "percent" ? `${promo.value}% off` : `${money(promo.value)} off`;
  const expired = promo.endsOn && promo.endsOn < new Date().toISOString().slice(0, 10);
  const fullyUsed = promo.usageLimit != null && promo.usedCount >= promo.usageLimit;
  const live = promo.active && !expired && !fullyUsed;
  const window = [promo.startsOn && `from ${fmtDate(promo.startsOn)}`, promo.endsOn && `to ${fmtDate(promo.endsOn)}`].filter(Boolean).join(" ");
  return (
    <button
      onClick={onEdit}
      className="flex items-center gap-4 rounded-2xl border border-sand bg-white px-4 py-3.5 text-left transition-colors hover:border-sand-line hover:bg-cream"
    >
      <span className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl ${live ? "bg-brand-tint text-brand-deep" : "bg-sand text-ink-mute"}`}>
        {promo.kind === "percent" ? <Percent size={20} weight="bold" /> : <CurrencyDollar size={20} weight="fill" />}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-display text-[15px] font-extrabold tracking-wide text-ink">{promo.code}</span>
          {!live ? (
            <span className="rounded-full bg-sand px-2 py-0.5 text-[10px] font-extrabold text-ink-mute">
              {!promo.active ? "OFF" : expired ? "EXPIRED" : "USED UP"}
            </span>
          ) : null}
        </div>
        <div className="truncate text-[13px] font-medium text-ink-mute">
          {off}
          {promo.minSubtotalCents ? ` · min ${money(promo.minSubtotalCents)}` : ""}
          {window ? ` · ${window}` : ""}
        </div>
      </div>
      <div className="flex-shrink-0 text-right">
        <div className="font-display text-sm font-bold text-ink tabular-nums">{promo.usedCount}</div>
        <div className="text-[11px] font-semibold text-ink-mute">
          used{promo.usageLimit != null ? ` / ${promo.usageLimit}` : ""}
        </div>
      </div>
    </button>
  );
}

function PromoDrawer({ promo, onClose }: { promo: Promo | null; onClose: () => void }) {
  const router = useRouter();
  const [d, setD] = useState<Draft>(promo ? toDraft(promo) : emptyDraft);
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((s) => ({ ...s, [k]: v }));

  const valid = d.code.trim().length >= 2 && parseFloat(d.value || "0") > 0;

  async function save() {
    setBusy(true);
    setError(null);
    const payload = {
      code: d.code.trim(),
      kind: d.kind,
      value: d.kind === "percent" ? Math.round(parseFloat(d.value || "0")) : Math.round(parseFloat(d.value || "0") * 100),
      active: d.active,
      startsOn: d.startsOn || null,
      endsOn: d.endsOn || null,
      minSubtotalCents: Math.round(parseFloat(d.minSubtotal || "0") * 100),
      usageLimit: d.usageLimit.trim() ? Math.max(1, parseInt(d.usageLimit, 10)) : null,
    };
    const res = promo ? await updatePromoAction(promo.id, payload) : await createPromoAction(payload);
    if (res.ok) {
      router.refresh();
      onClose();
    } else {
      setError(res.error);
      setBusy(false);
    }
  }

  async function remove() {
    if (!promo) return;
    setDeleting(true);
    setError(null);
    const res = await deletePromoAction(promo.id);
    if (res.ok) {
      router.refresh();
      onClose();
    } else {
      setError(res.error);
      setDeleting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-ink/40" onClick={onClose}>
      <div className="flex h-full w-full max-w-md flex-col overflow-y-auto bg-cream shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-sand px-5 py-4">
          <h2 className="font-display text-xl font-bold text-ink">{promo ? "Edit code" : "New promo code"}</h2>
          <button onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-xl bg-white text-ink-soft" aria-label="Close">
            <X size={18} weight="bold" />
          </button>
        </div>

        <div className="flex-1 space-y-4 px-5 py-5">
          <Field label="Code">
            <input
              value={d.code}
              onChange={(e) => set("code", e.target.value.toUpperCase())}
              placeholder="SUMMER20"
              className="input font-bold tracking-wide"
            />
          </Field>

          <div>
            <span className="mb-1.5 block text-[13px] font-bold text-ink-soft">Discount</span>
            <div className="flex gap-2">
              <div className="flex flex-1 overflow-hidden rounded-xl border border-sand bg-white">
                <button
                  onClick={() => set("kind", "percent")}
                  className={`flex-1 py-2.5 text-[13px] font-bold transition-colors ${d.kind === "percent" ? "bg-brand text-white" : "text-ink-mute"}`}
                >
                  % off
                </button>
                <button
                  onClick={() => set("kind", "fixed")}
                  className={`flex-1 py-2.5 text-[13px] font-bold transition-colors ${d.kind === "fixed" ? "bg-brand text-white" : "text-ink-mute"}`}
                >
                  $ off
                </button>
              </div>
              <div className="flex w-28 items-center gap-1 rounded-xl border border-sand bg-white px-3">
                {d.kind === "fixed" ? <span className="text-sm font-bold text-ink-mute">$</span> : null}
                <input
                  type="number"
                  min="0"
                  max={d.kind === "percent" ? "100" : undefined}
                  value={d.value}
                  onChange={(e) => set("value", e.target.value)}
                  className="w-full bg-transparent py-2.5 text-sm font-bold text-ink outline-none"
                  placeholder={d.kind === "percent" ? "20" : "25"}
                />
                {d.kind === "percent" ? <span className="text-sm font-bold text-ink-mute">%</span> : null}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Min. subtotal ($)" hint="Optional">
              <input type="number" min="0" value={d.minSubtotal} onChange={(e) => set("minSubtotal", e.target.value)} placeholder="0" className="input" />
            </Field>
            <Field label="Usage limit" hint="Blank = unlimited">
              <input type="number" min="1" value={d.usageLimit} onChange={(e) => set("usageLimit", e.target.value)} placeholder="∞" className="input" />
            </Field>
            <Field label="Starts" hint="Optional">
              <input type="date" value={d.startsOn} max={d.endsOn || undefined} onChange={(e) => set("startsOn", e.target.value)} className="input" />
            </Field>
            <Field label="Ends" hint="Optional">
              <input type="date" value={d.endsOn} min={d.startsOn || undefined} onChange={(e) => set("endsOn", e.target.value)} className="input" />
            </Field>
          </div>

          <label className="flex cursor-pointer items-center gap-3">
            <input type="checkbox" checked={d.active} onChange={(e) => set("active", e.target.checked)} className="h-4 w-4 accent-brand" />
            <span className="text-[13px] font-bold text-ink-soft">Active (customers can use this code)</span>
          </label>

          {promo ? (
            <p className="text-[12px] font-medium text-ink-mute">Redeemed {promo.usedCount} time{promo.usedCount === 1 ? "" : "s"}.</p>
          ) : null}

          {error ? <div className="rounded-xl bg-coral-tint px-4 py-3 text-sm font-semibold text-coral-deep">{error}</div> : null}
        </div>

        <div className="flex items-center gap-2 border-t border-sand px-5 py-4">
          {promo ? (
            <button
              onClick={remove}
              disabled={deleting || busy}
              className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full border border-sand bg-white text-coral-deep transition-colors hover:bg-coral-tint disabled:opacity-50"
              aria-label="Delete code"
            >
              {deleting ? <CircleNotch size={18} weight="bold" className="animate-spin" /> : <Trash size={18} />}
            </button>
          ) : null}
          <button
            onClick={save}
            disabled={!valid || busy || deleting}
            className="flex flex-1 items-center justify-center gap-2 rounded-full bg-brand px-6 py-3 text-sm font-bold text-white transition-colors hover:bg-brand-deep disabled:cursor-not-allowed disabled:bg-sand disabled:text-ink-mute"
          >
            {busy ? <CircleNotch size={18} weight="bold" className="animate-spin" /> : null}
            {promo ? "Save changes" : "Create code"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[13px] font-bold text-ink-soft">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-[12px] font-medium text-ink-faint">{hint}</span> : null}
    </label>
  );
}
