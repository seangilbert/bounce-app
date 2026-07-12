import Link from "next/link";
import {
  Sparkle,
  Storefront,
  CalendarCheck,
  CreditCard,
  Signature,
  Truck,
  ChatCircleText,
  ArrowRight,
  Check,
} from "@phosphor-icons/react/dist/ssr";
import { PricingTiers } from "@/components/marketing/PricingTiers";

const FEATURES = [
  {
    icon: Sparkle,
    title: "AI quote assistant",
    body: "Customers ask in plain language and get an instant, accurate quote grounded in your real inventory and prices — even while you're on a job.",
  },
  {
    icon: Storefront,
    title: "Your own storefront",
    body: "A branded booking page for your business, with live availability and checkout. Share the link or embed it on your existing website.",
  },
  {
    icon: CalendarCheck,
    title: "Bookings & calendar",
    body: "Every reservation on one calendar with real availability math, so you never double-book your last bounce house on a busy Saturday.",
  },
  {
    icon: CreditCard,
    title: "Payments & payouts",
    body: "Take deposits or full payment at checkout and get paid directly to your bank via Stripe. Collect the balance on delivery in a tap.",
  },
  {
    icon: Signature,
    title: "E-signed contracts",
    body: "Rental agreements sent and signed automatically the moment a booking is paid — no chasing paperwork before the party.",
  },
  {
    icon: Truck,
    title: "Delivery routing",
    body: "See the day's drop-offs and pickups, priced by zone or distance, so your drivers know exactly where to go.",
  },
];

const STEPS = [
  {
    n: "1",
    title: "Add your inventory",
    body: "List your bounce houses, tables, tents — whatever you rent — with prices, quantities, and delivery rules.",
  },
  {
    n: "2",
    title: "Share your storefront",
    body: "Send customers your booking link. The AI assistant quotes them instantly and books the party for you.",
  },
  {
    n: "3",
    title: "Get paid & signed",
    body: "Payment lands in your account and the rental agreement is signed automatically. You just show up.",
  },
];

export default function MarketingHome() {
  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-x-0 -top-24 h-72 bg-gradient-to-b from-brand/5 to-transparent" />
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-5 py-16 sm:px-8 sm:py-24 lg:grid-cols-2">
          <div>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-sand-line bg-white px-3 py-1 text-[12.5px] font-bold text-ink-soft">
              <Sparkle size={14} weight="fill" className="text-brand" />
              For party & equipment rental operators
            </span>
            <h1 className="mt-5 font-display text-4xl font-extrabold leading-[1.05] tracking-tight text-ink sm:text-5xl lg:text-6xl">
              Quote every party in seconds.
            </h1>
            <p className="mt-5 max-w-lg text-lg font-medium text-ink-soft">
              Bounce is the all-in-one platform for rental operators — an AI assistant that answers
              customers instantly, plus booking, payments, contracts, and delivery in one place.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link
                href="/signup?plan=free"
                className="inline-flex items-center gap-2 rounded-full bg-brand px-6 py-3 text-sm font-bold text-white hover:bg-brand-deep"
              >
                Start free <ArrowRight size={16} weight="bold" />
              </Link>
              <Link
                href="/pricing"
                className="inline-flex items-center rounded-full border border-sand bg-white px-6 py-3 text-sm font-bold text-ink hover:bg-cream"
              >
                See pricing
              </Link>
            </div>
            <p className="mt-4 text-[13px] font-semibold text-ink-mute">
              No credit card required · Free plan forever
            </p>
          </div>

          {/* AI-quote taste — a static mock of the storefront chat. */}
          <div className="relative">
            <div className="mx-auto max-w-md rounded-[28px] border border-sand-line bg-white p-5 shadow-xl shadow-ink/5">
              <div className="flex items-center gap-2 border-b border-sand-line pb-3">
                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-brand text-white">
                  <ChatCircleText size={16} weight="fill" />
                </span>
                <div className="text-sm font-bold text-ink">Bounce Party Rentals</div>
                <span className="ml-auto flex items-center gap-1 text-[11px] font-bold text-teal">
                  <span className="h-1.5 w-1.5 rounded-full bg-teal" /> Online
                </span>
              </div>
              <div className="space-y-3 py-4">
                <div className="ml-auto max-w-[80%] rounded-2xl rounded-br-md bg-brand px-3.5 py-2.5 text-sm font-medium text-white">
                  Need a bounce house + 4 tables for Sat June 20, in Katy 77494
                </div>
                <div className="max-w-[88%] rounded-2xl rounded-bl-md bg-cream px-3.5 py-2.5 text-sm font-medium text-ink-soft">
                  Great — the Castle Combo is available that day! Here&apos;s your quote:
                  <div className="mt-2 space-y-1 rounded-xl border border-sand-line bg-white p-2.5 text-[13px]">
                    <div className="flex justify-between"><span>Castle Combo (1 day)</span><span className="font-bold text-ink">$225</span></div>
                    <div className="flex justify-between"><span>6ft tables × 4</span><span className="font-bold text-ink">$40</span></div>
                    <div className="flex justify-between"><span>Delivery — Katy</span><span className="font-bold text-ink">$25</span></div>
                    <div className="mt-1 flex justify-between border-t border-sand-line pt-1"><span className="font-bold text-ink">Total</span><span className="font-extrabold text-ink">$290</span></div>
                  </div>
                </div>
                <div className="max-w-[70%] rounded-2xl rounded-bl-md bg-cream px-3.5 py-2.5 text-sm font-medium text-ink-soft">
                  Want me to lock in June 20? 🎉
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Value strip */}
      <section className="border-y border-sand-line bg-cream-2">
        <div className="mx-auto grid max-w-6xl gap-6 px-5 py-8 sm:grid-cols-3 sm:px-8">
          {[
            "Answer customers 24/7 without lifting a finger",
            "Stop double-booking with real availability",
            "Get paid and signed before the truck leaves",
          ].map((line) => (
            <div key={line} className="flex items-start gap-2 text-sm font-semibold text-ink-soft">
              <Check size={18} weight="bold" className="mt-0.5 shrink-0 text-teal" />
              {line}
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section id="features" className="scroll-mt-20">
        <div className="mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-24">
          <div className="max-w-2xl">
            <h2 className="font-display text-3xl font-extrabold tracking-tight text-ink sm:text-4xl">
              Everything you need to run rentals
            </h2>
            <p className="mt-3 text-lg font-medium text-ink-mute">
              From the first customer question to the driver dropping off — Bounce handles the whole
              job so you can take on more parties.
            </p>
          </div>
          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <div key={f.title} className="rounded-3xl border border-sand-line bg-white p-6">
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand/10 text-brand">
                  <f.icon size={22} weight="fill" />
                </span>
                <h3 className="mt-4 font-display text-lg font-bold text-ink">{f.title}</h3>
                <p className="mt-1.5 text-sm font-medium text-ink-mute">{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="border-y border-sand-line bg-cream-2">
        <div className="mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-24">
          <h2 className="font-display text-3xl font-extrabold tracking-tight text-ink sm:text-4xl">
            Up and running in an afternoon
          </h2>
          <div className="mt-12 grid gap-8 sm:grid-cols-3">
            {STEPS.map((s) => (
              <div key={s.n}>
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-brand font-display text-lg font-extrabold text-white">
                  {s.n}
                </span>
                <h3 className="mt-4 font-display text-xl font-bold text-ink">{s.title}</h3>
                <p className="mt-1.5 text-sm font-medium text-ink-mute">{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="scroll-mt-20">
        <div className="mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-24">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="font-display text-3xl font-extrabold tracking-tight text-ink sm:text-4xl">
              Simple pricing that scales with you
            </h2>
            <p className="mt-3 text-lg font-medium text-ink-mute">
              Start free. Upgrade when you&apos;re booking more than you can count.
            </p>
          </div>
          <div className="mt-12">
            <PricingTiers />
          </div>
          <div className="mt-6 text-center">
            <Link href="/pricing" className="text-sm font-bold text-brand hover:text-brand-deep">
              Compare plans in detail →
            </Link>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="px-5 pb-20 sm:px-8">
        <div className="mx-auto max-w-6xl overflow-hidden rounded-[32px] bg-ink px-8 py-14 text-center sm:py-20">
          <h2 className="mx-auto max-w-2xl font-display text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
            Ready to book more parties?
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-lg font-medium text-cream/70">
            Set up your storefront in minutes and let the AI assistant do the quoting.
          </p>
          <Link
            href="/signup?plan=free"
            className="mt-8 inline-flex items-center gap-2 rounded-full bg-brand px-7 py-3.5 text-sm font-bold text-white hover:bg-brand-deep"
          >
            Start free <ArrowRight size={16} weight="bold" />
          </Link>
        </div>
      </section>
    </>
  );
}
