import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ArrowRight } from "@phosphor-icons/react/dist/ssr";
import { PLAN_CAPABILITIES, PLAN_LIST, type PlanId } from "@/lib/plans";
import { SignupCta } from "@/components/marketing/SignupCta";
import { FeatureMatrix } from "@/components/marketing/FeatureMatrix";
import { liveFeatureGroups, type GateKey } from "@/lib/marketing/features";

export const metadata: Metadata = {
  title: "Full feature list | Movables",
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

/**
 * The plan differences, and nothing else — the answer to "why pay?" in one
 * glance before the full matrix. Derived from PLAN_CAPABILITIES (same source
 * as the matrix columns), so it cannot drift from real billing. The one
 * hand-written line is Priority support, which mirrors the matrix's
 * `plans: ["growing"]` escape-hatch row.
 */
const GATE_LABELS: Record<GateKey, string> = {
  esignContracts: "E-signed rental agreements",
  smsChannel: "Two-way text messaging",
  followUpAgents: "Follow-up agents: balance, quote, contract",
  teamMembers: "Team members, roles, driver logins",
  apiAccess: "API + embed on your own website",
};
const GATE_ORDER: GateKey[] = [
  "esignContracts",
  "smsChannel",
  "followUpAgents",
  "teamMembers",
  "apiAccess",
];

function unlockedOver(planId: PlanId, prev: PlanId): string[] {
  return GATE_ORDER.filter(
    (g) => PLAN_CAPABILITIES[planId][g] && !PLAN_CAPABILITIES[prev][g],
  ).map((g) => GATE_LABELS[g]);
}

function digestFor(planId: PlanId): { intro: string | null; lines: string[] } {
  const caps = PLAN_CAPABILITIES[planId];
  if (planId === "free") {
    return {
      intro: null,
      lines: [
        `${caps.maxItems} catalog items`,
        `${caps.aiQuotesPerMonth} AI quotes a month`,
        `${caps.platformFeeBps / 100}% platform fee on bookings`,
      ],
    };
  }
  if (planId === "solo") {
    return {
      intro: "Everything in Free, plus:",
      lines: [
        "Unlimited catalog items and AI quotes",
        `${caps.platformFeeBps / 100}% platform fee`,
        ...unlockedOver("solo", "free"),
      ],
    };
  }
  return {
    intro: "Everything in Solo, plus:",
    lines: [...unlockedOver("growing", "solo"), "Priority support"],
  };
}

function PlanDigest() {
  return (
    <section className="border-b border-sand-line">
      <div className="mx-auto max-w-4xl px-5 py-12 sm:px-8 sm:py-14">
        <h2 className="font-display text-2xl font-extrabold tracking-tight text-ink">
          Where the plans actually differ
        </h2>
        <p className="mt-2 max-w-2xl text-[15px] text-ink-soft">
          The short version. Every other row on this page is included on all three plans.
        </p>
        <div className="mt-8 grid gap-5 md:grid-cols-3">
          {PLAN_LIST.map((plan) => {
            const d = digestFor(plan.id);
            return (
              <div key={plan.id} className="rounded-3xl border border-sand-line bg-white p-6">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-display text-lg font-bold text-ink">{plan.name}</span>
                  <span className="text-sm font-semibold text-ink-soft">
                    {plan.priceCents === 0 ? "$0" : `$${Math.round(plan.priceCents / 100)}/mo`}
                  </span>
                </div>
                {d.intro ? (
                  <p className="mt-3 text-[13px] font-semibold text-ink-soft">{d.intro}</p>
                ) : null}
                <ul className="mt-3 divide-y divide-sand-line text-sm text-ink-soft">
                  {d.lines.map((line) => (
                    <li key={line} className="py-2 first:pt-0 last:pb-0">
                      {line}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

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
          <p className="mt-4 max-w-2xl text-lg text-ink-mute">
            The complete list, grouped the way the product is. Anything not on this page is something
            we have not built yet.
          </p>
          <p className="mt-3 max-w-2xl text-[15px] text-ink-soft">
            Most of it is included on every plan, Free included. Paid plans add capacity, drop the
            booking fee, and unlock the automation and team layers; those rows are highlighted below.
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

      <PlanDigest />

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
            <p className="mt-1.5 text-[15px] text-ink-soft">
              Your storefront, the quote assistant, and real bookings, with no card.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <SignupCta
              plan="free"
              className="inline-flex items-center gap-2 rounded-full bg-ink px-6 py-3 text-sm font-bold text-cream transition-colors hover:bg-ink-deep active:translate-y-px"
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
