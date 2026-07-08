"use client";

import { useState } from "react";
import { CircleNotch, ArrowRight } from "@phosphor-icons/react/dist/ssr";

/** Kicks off the same Stripe checkout the storefront uses, for this booking. */
export function PayButton({
  bookingId,
  paymentType,
  dueLabel,
}: {
  bookingId: string;
  paymentType: "deposit" | "full";
  dueLabel: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pay() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bookingId,
          paymentType,
          successUrl: `${location.origin}/book/success`,
          cancelUrl: location.href,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.url) throw new Error(json.error ?? "Couldn't start checkout.");
      location.href = json.url;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
      setBusy(false);
    }
  }

  return (
    <div className="mt-4">
      <button
        onClick={pay}
        disabled={busy}
        className="flex w-full items-center justify-center gap-2 rounded-full bg-brand px-6 py-3.5 text-sm font-bold text-white transition-colors hover:bg-brand-deep disabled:cursor-not-allowed disabled:bg-sand disabled:text-ink-mute"
      >
        {busy ? (
          <CircleNotch size={18} weight="bold" className="animate-spin" />
        ) : (
          <>
            {paymentType === "full" ? "Pay" : "Pay deposit"} {dueLabel} <ArrowRight size={16} weight="bold" />
          </>
        )}
      </button>
      {error ? <p className="mt-2 text-center text-[13px] font-semibold text-coral-deep">{error}</p> : null}
    </div>
  );
}
