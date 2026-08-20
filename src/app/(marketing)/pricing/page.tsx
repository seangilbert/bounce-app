import type { Metadata } from "next";
import Link from "next/link";
import { PricingTiers } from "@/components/marketing/PricingTiers";
import { SignupCta } from "@/components/marketing/SignupCta";
import { PLANS } from "@/lib/plans";

const solo = PLANS.solo.priceCents / 100;
const growing = PLANS.growing.priceCents / 100;

export const metadata: Metadata = {
  title: "Pricing | Movables",
  // Derived from lib/plans so the advertised numbers can't drift from billing.
  description: `Start free. Solo at $${solo}/mo and Growing at $${growing}/mo unlock unlimited quotes, e-signed contracts, team members, and more.`,
};

const FAQ = [
  {
    q: "Is there really a free plan?",
    a: "Yes. The Free plan lets you run your storefront and take bookings with up to 20 AI quotes a month and 5 catalog items, no credit card required. Upgrade whenever you outgrow it.",
  },
  {
    q: "What happens after the trial?",
    a: "Paid plans include a 14-day free trial. You won't be charged until it ends, and you can cancel anytime before then. If a subscription lapses, your account simply moves back to the Free plan, and you keep your data and storefront.",
  },
  {
    q: "How do payments to me work?",
    a: "Movables uses Stripe Connect, so customer payments go directly to your own bank account. You connect your account once during setup. Standard card processing is 2.9% + 30¢ per charge on every plan; Free-plan bookings also carry a 2% platform fee, which drops to 0% on Solo and Growing.",
  },
  {
    q: "Do my customers need an account?",
    a: "No. Customers just visit your storefront link, get a quote from the AI assistant, and check out. No login required.",
  },
  {
    q: "Can I use Movables on my existing website?",
    a: "Yes. On the Growing plan you can embed your storefront and AI quoting directly into your own site, or connect via the API.",
  },
];

export default function PricingPage() {
  return (
    <>
      <section className="mx-auto max-w-6xl px-5 pt-16 sm:px-8 sm:pt-24">
        <div className="mx-auto max-w-2xl text-center">
          <h1 className="font-display text-4xl font-extrabold tracking-tighter text-ink sm:text-5xl">
            Pricing built for operators
          </h1>
          <p className="mt-4 text-lg text-ink-mute">
            Start free and upgrade as you grow. Every plan includes your storefront, the AI quote
            assistant, and direct payouts.
          </p>
        </div>
        <div className="mt-14">
          <PricingTiers />
        </div>
        <p className="mt-6 text-center text-[13px] font-medium text-ink-soft">
          Paid plans include a 14-day free trial. Cancel anytime.
        </p>
      </section>

      <section className="mx-auto max-w-3xl px-5 py-20 sm:px-8 sm:py-24">
        <h2 className="text-center font-display text-3xl font-extrabold tracking-tight text-ink">
          Questions, answered
        </h2>
        <div className="mt-10 divide-y divide-sand-line rounded-3xl border border-sand-line bg-white">
          {FAQ.map((item) => (
            <div key={item.q} className="p-6">
              <h3 className="font-display text-lg font-bold text-ink">{item.q}</h3>
              <p className="mt-1.5 text-sm text-ink-soft">{item.a}</p>
            </div>
          ))}
        </div>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "FAQPage",
              mainEntity: FAQ.map((item) => ({
                "@type": "Question",
                name: item.q,
                acceptedAnswer: { "@type": "Answer", text: item.a },
              })),
            }),
          }}
        />
        <div className="mt-12 text-center">
          <SignupCta
            plan="free"
            className="inline-flex items-center rounded-full bg-ink px-7 py-3.5 text-sm font-bold text-cream hover:bg-ink-deep"
          >
            Get started free
          </SignupCta>
        </div>
      </section>
    </>
  );
}
