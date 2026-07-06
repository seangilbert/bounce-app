"use client";

import { useState } from "react";
import { CreditCard, ArrowRight, CircleNotch } from "@phosphor-icons/react/dist/ssr";

/** Shown on the dashboard until the operator connects Stripe to receive payouts. */
export function ConnectBanner() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function connect() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/connect/onboard", { method: "POST" });
      const json = await res.json();
      if (!res.ok || !json.url) throw new Error(json.error ?? "Couldn't start setup.");
      window.location.href = json.url;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-[20px] border border-amber-line bg-amber-tint px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3">
        <CreditCard size={22} weight="fill" className="mt-0.5 flex-shrink-0 text-amber-deep" />
        <div>
          <div className="text-[15px] font-bold text-[#5C4B22]">Set up payments to get paid</div>
          <p className="text-[13.5px] font-medium leading-snug text-[#8A7A55]">
            Connect your Stripe account so customer payments land in your bank.
            {error ? <span className="text-coral-deep"> {error}</span> : null}
          </p>
        </div>
      </div>
      <button
        onClick={connect}
        disabled={loading}
        className="flex flex-shrink-0 items-center justify-center gap-2 rounded-full bg-amber px-5 py-2.5 text-sm font-extrabold text-white transition-colors hover:bg-amber-deep disabled:opacity-70"
      >
        {loading ? (
          <>
            <CircleNotch size={16} weight="bold" className="animate-spin" /> Starting…
          </>
        ) : (
          <>
            Connect Stripe <ArrowRight size={15} weight="bold" />
          </>
        )}
      </button>
    </div>
  );
}
