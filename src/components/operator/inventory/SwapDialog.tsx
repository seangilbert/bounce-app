"use client";

import { useEffect, useState } from "react";
import { ArrowsLeftRight, CircleNotch, X } from "@phosphor-icons/react/dist/ssr";
import { listSwapCandidatesAction, swapLiveAction } from "@/app/(operator)/inventory/actions";
import { money } from "./shared";

/** Offered when activating an item is blocked by the live-item cap: pick one
 *  live item to hide in its place — a straight slot trade, nothing deleted. */
export function SwapDialog({
  activateId,
  activateName,
  onDone,
  onClose,
}: {
  activateId: string;
  activateName: string;
  onDone: () => void;
  onClose: () => void;
}) {
  const [candidates, setCandidates] = useState<{ id: string; name: string; basePrice: number }[] | null>(null);
  const [chosen, setChosen] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void listSwapCandidatesAction().then((res) => {
      if (res.ok) setCandidates(res.items);
      else setError(res.error);
    });
  }, []);

  async function confirm() {
    if (!chosen) return;
    setBusy(true);
    setError(null);
    const res = await swapLiveAction(activateId, chosen);
    if (res.ok) onDone();
    else {
      setError(res.error);
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-ink/40 p-4" onClick={onClose}>
      <div
        className="flex max-h-[80vh] w-full max-w-md flex-col overflow-hidden rounded-2xl bg-cream shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-sand px-5 py-4">
          <h2 className="font-display text-lg font-bold text-ink">Swap a live slot</h2>
          <button onClick={onClose} className="text-ink-mute hover:text-ink" aria-label="Close">
            <X size={18} weight="bold" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">
          <p className="mb-3 text-sm font-medium text-ink-mute">
            Choose which live item to hide so <span className="font-bold text-ink">{activateName}</span> can
            take its slot. Hidden items stay saved.
          </p>
          {error ? (
            <p className="mb-3 rounded-xl bg-coral/10 px-3 py-2 text-sm font-semibold text-coral">{error}</p>
          ) : null}
          {candidates === null ? (
            <div className="flex justify-center py-6 text-ink-mute">
              <CircleNotch size={22} className="animate-spin" />
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              {candidates.map((c) => (
                <label
                  key={c.id}
                  className={`flex cursor-pointer items-center justify-between rounded-xl border-2 px-3 py-2.5 text-sm font-bold transition-colors ${
                    chosen === c.id ? "border-brand bg-brand-tint/40 text-ink" : "border-sand-line bg-white text-ink-soft"
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="swap"
                      checked={chosen === c.id}
                      onChange={() => setChosen(c.id)}
                      className="h-4 w-4 accent-brand"
                    />
                    {c.name}
                  </span>
                  <span className="text-ink-mute">{money(c.basePrice)}</span>
                </label>
              ))}
            </div>
          )}
        </div>
        <div className="border-t border-sand px-5 py-4">
          <button
            onClick={() => void confirm()}
            disabled={!chosen || busy}
            className="flex w-full items-center justify-center gap-2 rounded-full bg-brand px-5 py-2.5 text-sm font-bold text-white hover:bg-brand-deep disabled:opacity-50"
          >
            <ArrowsLeftRight size={16} weight="bold" />
            {busy ? "Swapping…" : "Swap"}
          </button>
        </div>
      </div>
    </div>
  );
}
