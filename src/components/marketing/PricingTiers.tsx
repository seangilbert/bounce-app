"use client";

import { useState } from "react";
import { Check } from "@phosphor-icons/react/dist/ssr";
import { PLAN_LIST, PLAN_CAPABILITIES, type BillingInterval, type PlanId } from "@/lib/plans";
import { processingFeeLabel } from "@/lib/fees";
import { SignupCta } from "@/components/marketing/SignupCta";

/** Plan the pricing grid highlights as the default choice. */
const POPULAR: PlanId = "solo";

function ctaLabel(id: PlanId): string {
  return id === "free" ? "Start free" : "Start 14-day trial";
}

/** The three plans as cards, sourced from lib/plans so they mirror real billing,
 *  with a monthly/annual toggle (annual = 2 months free, its own Stripe price).
 *  Every CTA lands on signup with the plan + interval preselected. The fee line
 *  below the grid derives from lib/fees + PLAN_CAPABILITIES so it can't drift
 *  from what checkout actually charges. */
export function PricingTiers() {
  const [interval, setInterval] = useState<BillingInterval>("month");
  const yearly = interval === "year";
  const freeFeePct = PLAN_CAPABILITIES.free.platformFeeBps / 100;

  return (
    <div>
      <div className="mb-8 flex justify-center">
        <div className="flex rounded-full border border-sand-line bg-white p-1">
          {(
            [
              { value: "month", label: "Monthly" },
              { value: "year", label: "Annual (2 months free)" },
            ] as const
          ).map((opt) => (
            <button
              key={opt.value}
              onClick={() => setInterval(opt.value)}
              className={`rounded-full px-4 py-1.5 text-[13px] font-bold transition-colors ${
                interval === opt.value ? "bg-ink text-cream" : "text-ink-soft hover:text-ink"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-5 md:grid-cols-3">
        {PLAN_LIST.map((plan) => {
          const popular = plan.id === POPULAR;
          const paid = plan.priceCents > 0;
          const cents = yearly && plan.yearlyPriceCents !== null ? plan.yearlyPriceCents : plan.priceCents;
          return (
            <div
              key={plan.id}
              className={`relative flex flex-col rounded-3xl border bg-white p-6 ${
                popular ? "border-ink shadow-lg shadow-ink/5 ring-1 ring-ink" : "border-sand-line"
              }`}
            >
              {popular ? (
                <span className="absolute -top-3 left-6 rounded-full bg-ink px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-white">
                  Most popular
                </span>
              ) : null}
              <div className="font-display text-lg font-bold text-ink">{plan.name}</div>
              <p className="mt-0.5 text-[13.5px] text-ink-soft">{plan.tagline}</p>
              <div className="mt-4 flex items-baseline gap-1">
                <span className="font-display text-4xl font-extrabold tracking-tight text-ink">
                  {paid ? `$${Math.round(cents / 100)}` : "$0"}
                </span>
                <span className="text-sm font-semibold text-ink-soft">
                  {paid && yearly ? "/yr" : "/mo"}
                </span>
              </div>

              <ul className="mt-5 space-y-2.5">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm text-ink-soft">
                    <Check size={17} weight="bold" className="mt-0.5 shrink-0 text-brand" />
                    {f}
                  </li>
                ))}
              </ul>

              <SignupCta
                plan={plan.id}
                interval={paid ? interval : undefined}
                className={`mt-6 flex items-center justify-center rounded-full px-5 py-2.5 text-sm font-bold ${
                  popular
                    ? "bg-ink text-cream hover:bg-ink-deep"
                    : "border border-sand bg-white text-ink hover:bg-cream"
                }`}
              >
                {ctaLabel(plan.id)}
              </SignupCta>
            </div>
          );
        })}
      </div>
      <p className="mt-5 text-center text-[13px] font-medium text-ink-soft">
        Every plan pays standard card processing ({processingFeeLabel()} per charge). Free-plan
        bookings carry a {freeFeePct}% platform fee; Solo and Growing pay none.
      </p>
    </div>
  );
}
