"use client";

import { useState } from "react";
import { CircleNotch } from "@phosphor-icons/react";

/**
 * The plan-upgrade CTA: POSTs /api/billing/checkout and follows the Stripe
 * Checkout URL. One shared component for the flow previously copy-pasted in
 * TeamSection / DeveloperSection / AccountSection / AgentsView.
 */
export function UpgradeButton({
  plan,
  children,
  className,
}: {
  plan: "solo" | "growing";
  children: React.ReactNode;
  className?: string;
}) {
  const [busy, setBusy] = useState(false);

  async function upgrade() {
    setBusy(true);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      const json = await res.json();
      if (res.ok && json.url) window.location.href = json.url;
      else setBusy(false);
    } catch {
      setBusy(false);
    }
  }

  return (
    <button
      onClick={upgrade}
      disabled={busy}
      className={
        className ??
        "mt-2 flex items-center gap-2 rounded-full bg-brand px-4 py-2 text-sm font-bold text-white hover:bg-brand-deep disabled:opacity-60"
      }
    >
      {busy ? <CircleNotch size={14} weight="bold" className="animate-spin" /> : null}
      {children}
    </button>
  );
}
