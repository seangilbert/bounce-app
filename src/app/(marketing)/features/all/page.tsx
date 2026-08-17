import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ArrowRight } from "@phosphor-icons/react/dist/ssr";
import { PLAN_LIST } from "@/lib/plans";
import { SignupCta } from "@/components/marketing/SignupCta";
import { FeatureMatrix } from "@/components/marketing/FeatureMatrix";
import { liveFeatureGroups } from "@/lib/marketing/features";

export const metadata: Metadata = {
  title: "Full feature list — Movables",
  description:
    "Every Movables capability, grouped and compared across the Free, Solo, and Growing plans: AI quoting, inbox, storefront, bookings, payments, delivery, follow-up agents, customers, paperwork, team, and security.",
  openGraph: {
    title: "Movables, feature by feature",
    description: "The complete capability list, compared across all three plans.",
    type: "website",
  },
};

/*
 * The lookup half of the features story. `/features` sells the product in prose;
 * this page answers "does it do X, and on which plan?" without making anyone
 * scroll past a hundred table rows to reach the pricing and CTA.
 *
 * Plan columns are resolved from PLAN_CAPABILITIES inside FeatureMatrix, and the
 * prices below come from lib/plans, so neither can drift from real billing.
 */
export default function AllFeaturesPage() {
  const groups = liveFeatureGroups();

  return (
    <>
      <section className="border-b border-sand-line bg-cream-2">
        <div className="mx-auto max-w-4xl px-5 pb-12 pt-12 sm:px-8 sm:pb-16 sm:pt-16">
          <Link
            href="/features"
            className="inline-flex items-center gap-1.5 text-sm font-bold text-ink-mute transition-colors hover:text-ink"
          >
            <ArrowLeft size={15} weight="bold" />
            Features
          </Link>
          <h1 className="mt-5 font-display text-4xl font-extrabold tracking-tighter text-ink sm:text-5xl">
            Every feature, plan by plan
          </h1>
          <p className="mt-4 max-w-2xl text-lg font-medium text-ink-mute">
            The complete list, grouped the way the product is. Anything not on this page is something
            we have not built yet.
          </p>
          <p className="mt-5 text-sm font-semibold text-ink-soft">
            {PLAN_LIST.map((plan, i) => (
              <span key={plan.id}>
                {i > 0 ? <span className="px-2 text-ink-faint">/</span> : null}
                {plan.name}
                {plan.priceCents === 0 ? null : ` $${Math.round(plan.priceCents / 100)} a month`}
              </span>
            ))}
          </p>
        </div>
      </section>

      <section>
        <div className="mx-auto max-w-4xl px-5 py-16 sm:px-8 sm:py-20">
          <FeatureMatrix groups={groups} />
        </div>
      </section>

      <section className="border-t border-sand-line bg-cream-2">
        <div className="mx-auto flex max-w-4xl flex-col items-start gap-6 px-5 py-14 sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <div>
            <h2 className="font-display text-2xl font-extrabold tracking-tight text-ink">
              Start on the free plan
            </h2>
            <p className="mt-1.5 text-[15px] font-medium text-ink-mute">
              Your storefront, the quote assistant, and real bookings, with no card.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <SignupCta
              plan="free"
              className="inline-flex items-center gap-2 rounded-full bg-brand px-6 py-3 text-sm font-bold text-white transition-colors hover:bg-brand-deep active:translate-y-px"
            >
              Start free <ArrowRight size={16} weight="bold" />
            </SignupCta>
            <Link
              href="/pricing"
              className="inline-flex items-center rounded-full border border-sand bg-white px-6 py-3 text-sm font-bold text-ink transition-colors hover:bg-cream active:translate-y-px"
            >
              See pricing
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
