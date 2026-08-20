import { CaretDown } from "@phosphor-icons/react/dist/ssr";
import { PLANS, PLAN_CAPABILITIES } from "@/lib/plans";

/**
 * Objection-handling FAQ for the homepage (the pricing page keeps its own
 * billing-focused list). Native <details> accordion, so it's server-rendered
 * with no client JS, and the same data feeds FAQPage JSON-LD for search.
 */

const soloPrice = PLANS.solo.priceCents / 100;
const free = PLAN_CAPABILITIES.free;

const FAQ: Array<{ q: string; a: string }> = [
  {
    q: "I already have a website. Do I need to replace it?",
    a: "No. Your Movables storefront is a link you can share anywhere: texts, social, Google Business. On the Growing plan you can also embed the storefront and AI assistant directly into the website you already have.",
  },
  {
    q: "How does the AI know my prices and availability?",
    a: "Every answer is grounded in your real catalog: your items, prices, quantities, delivery rules, and live booking calendar. It only quotes what's actually available on the date the customer asks about, so it can't promise a bounce house you've already rented out.",
  },
  {
    q: "What if I'd rather answer a customer myself?",
    a: "Every conversation lands in your inbox, and you can step in and take over at any time. The AI covers the questions that arrive while you're on a delivery or asleep; you stay in control of anything you want to handle personally.",
  },
  {
    q: "Do my customers need to download an app?",
    a: "No. Your storefront is just a link that opens in any browser on any phone. Customers ask their question, get a quote, book, pay, and sign without creating an account.",
  },
  {
    q: "How long does setup take?",
    a: "Most operators are live in an afternoon. Add your inventory, connect Stripe so payouts go to your bank, and share your link. A guided checklist in the app walks you through each step.",
  },
  {
    q: "What does it cost?",
    a: `The Free plan is free forever, with up to ${free.maxItems} catalog items and ${free.aiQuotesPerMonth} AI quotes a month. Paid plans start at $${soloPrice}/month, unlock unlimited quotes, and drop the platform fee to zero.`,
  },
];

export function HomeFaq() {
  return (
    <section id="faq" className="scroll-mt-20">
      <div className="mx-auto max-w-3xl px-5 pb-16 sm:px-8 sm:pb-24">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="font-display text-3xl font-extrabold tracking-tighter text-ink sm:text-4xl">
            Wondering if it fits your business?
          </h2>
          <p className="mt-3 text-lg text-ink-mute">
            The questions rental operators ask us most.
          </p>
        </div>
        <div className="mt-10 divide-y divide-sand-line rounded-3xl border border-sand-line bg-white px-6">
          {FAQ.map((item) => (
            <details key={item.q} className="group py-5">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-display text-[17px] font-bold text-ink [&::-webkit-details-marker]:hidden">
                {item.q}
                <CaretDown
                  size={18}
                  weight="bold"
                  className="shrink-0 text-ink-mute transition-transform duration-200 group-open:rotate-180"
                  aria-hidden
                />
              </summary>
              <p className="mt-2.5 max-w-xl text-sm leading-relaxed text-ink-soft">{item.a}</p>
            </details>
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
      </div>
    </section>
  );
}
