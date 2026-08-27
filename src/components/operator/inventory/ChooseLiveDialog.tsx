"use client";

import { useState } from "react";
import { CircleNotch, X } from "@phosphor-icons/react/dist/ssr";
import type { Item } from "@/lib/inventory/types";
import { chooseLiveItemsAction } from "@/app/(operator)/inventory/actions";
import { money } from "./shared";

/** The "pick your live items" moment: shown when a downgrade left more items
 *  live than the plan allows. Pre-selects the items the storefront currently
 *  serves (oldest first — the read-time guard's order) so confirming without
 *  changes matches what customers already see. */
export function ChooseLiveDialog({
  items,
  itemLimit,
  onDone,
  onClose,
}: {
  items: Item[];
  itemLimit: number;
  onDone: () => void;
  onClose: () => void;
}) {
  const [chosen, setChosen] = useState<Set<string>>(() => {
    const preselected = items
      .filter((i) => i.active)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
      .slice(0, itemLimit)
      .map((i) => i.id);
    return new Set(preselected);
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const toggle = (id: string) =>
    setChosen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else if (next.size < itemLimit) next.add(id);
      return next;
    });

  async function confirm() {
    setBusy(true);
    setError(null);
    const res = await chooseLiveItemsAction([...chosen]);
    if (res.ok) onDone();
    else {
      setError(res.error);
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-ink/40 p-4" onClick={onClose}>
      <div
        className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-cream shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-sand px-5 py-4">
          <div>
            <h2 className="font-display text-lg font-bold text-ink">Choose your live items</h2>
            <p className="text-[13px] font-semibold text-ink-mute">
              {chosen.size} of {itemLimit} slots used — everything else stays saved as hidden
            </p>
          </div>
          <button onClick={onClose} className="text-ink-mute hover:text-ink" aria-label="Close">
            <X size={18} weight="bold" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {error ? (
            <p className="mb-3 rounded-xl bg-coral/10 px-3 py-2 text-sm font-semibold text-coral">{error}</p>
          ) : null}
          <div className="flex flex-col gap-1.5">
            {items.map((i) => {
              const selected = chosen.has(i.id);
              const full = !selected && chosen.size >= itemLimit;
              return (
                <label
                  key={i.id}
                  className={`flex items-center justify-between rounded-xl border-2 px-3 py-2.5 text-sm font-bold transition-colors ${
                    selected
                      ? "border-brand bg-brand-tint/40 text-ink"
                      : full
                        ? "cursor-not-allowed border-sand-line bg-white text-ink-mute opacity-60"
                        : "cursor-pointer border-sand-line bg-white text-ink-soft"
                  }`}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <input
                      type="checkbox"
                      checked={selected}
                      disabled={full}
                      onChange={() => toggle(i.id)}
                      className="h-4 w-4 flex-shrink-0 accent-brand"
                    />
                    <span className="truncate">{i.name}</span>
                  </span>
                  <span className="flex-shrink-0 pl-2 text-ink-mute">{money(i.basePrice)}</span>
                </label>
              );
            })}
          </div>
        </div>
        <div className="border-t border-sand px-5 py-4">
          <button
            onClick={() => void confirm()}
            disabled={busy}
            className="flex w-full items-center justify-center gap-2 rounded-full bg-brand px-5 py-2.5 text-sm font-bold text-white hover:bg-brand-deep disabled:opacity-50"
          >
            {busy ? <CircleNotch size={16} className="animate-spin" /> : null}
            {busy ? "Saving…" : `Keep these ${chosen.size} live`}
          </button>
        </div>
      </div>
    </div>
  );
}
