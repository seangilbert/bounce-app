import Link from "next/link";
import { Check } from "@phosphor-icons/react/dist/ssr";
import { PLAN_LIST, type PlanId } from "@/lib/plans";

/** Plan the pricing grid highlights as the default choice. */
const POPULAR: PlanId = "solo";

function priceLabel(cents: number): string {
  return cents === 0 ? "$0" : `$${Math.round(cents / 100)}`;
}

function ctaLabel(id: PlanId): string {
  return id === "free" ? "Start free" : "Start 14-day trial";
}

/** The three plans as cards, sourced from lib/plans so they mirror real billing.
 *  Every CTA lands on signup with the plan preselected. */
export function PricingTiers() {
  return (
    <div className="grid gap-5 md:grid-cols-3">
      {PLAN_LIST.map((plan) => {
        const popular = plan.id === POPULAR;
        return (
          <div
            key={plan.id}
            className={`relative flex flex-col rounded-3xl border bg-white p-6 ${
              popular ? "border-brand shadow-lg shadow-brand/5 ring-1 ring-brand" : "border-sand-line"
            }`}
          >
            {popular ? (
              <span className="absolute -top-3 left-6 rounded-full bg-brand px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-white">
                Most popular
              </span>
            ) : null}
            <div className="font-display text-lg font-bold text-ink">{plan.name}</div>
            <p className="mt-0.5 text-[13.5px] font-medium text-ink-mute">{plan.tagline}</p>
            <div className="mt-4 flex items-baseline gap-1">
              <span className="font-display text-4xl font-extrabold text-ink">{priceLabel(plan.priceCents)}</span>
              <span className="text-sm font-semibold text-ink-mute">/mo</span>
            </div>

            <ul className="mt-5 space-y-2.5">
              {plan.features.map((f) => (
                <li key={f} className="flex items-start gap-2 text-sm font-medium text-ink-soft">
                  <Check size={17} weight="bold" className="mt-0.5 shrink-0 text-teal" />
                  {f}
                </li>
              ))}
            </ul>

            <Link
              href={`/signup?plan=${plan.id}`}
              className={`mt-6 flex items-center justify-center rounded-full px-5 py-2.5 text-sm font-bold ${
                popular
                  ? "bg-brand text-white hover:bg-brand-deep"
                  : "border border-sand bg-white text-ink hover:bg-cream"
              }`}
            >
              {ctaLabel(plan.id)}
            </Link>
          </div>
        );
      })}
    </div>
  );
}
