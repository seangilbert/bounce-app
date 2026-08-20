import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  ChatCircleText,
  CreditCard,
  Files,
  Sparkle,
  Truck,
  UsersThree,
} from "@phosphor-icons/react/dist/ssr";
import { PricingTiers } from "@/components/marketing/PricingTiers";
import { SignupCta } from "@/components/marketing/SignupCta";
import { liveFeatureGroups, type FeatureGroup, type Highlight } from "@/lib/marketing/features";
import { SETUP_STEPS } from "@/components/operator/setup/steps";
import type { SetupStepKey } from "@/lib/operator/setup";

export const metadata: Metadata = {
  title: "Features | Movables",
  description:
    "Every part of Movables: AI quoting from your live catalog, one inbox for every channel, a branded storefront, oversell-proof bookings, payments and payouts, delivery routing, automated follow-ups, and a customer record that builds itself.",
  openGraph: {
    title: "Everything Movables does",
    description:
      "AI quoting, a branded storefront, oversell-proof bookings, payments, delivery routing, and a team of automated follow-ups. The full feature list, plan by plan.",
    type: "website",
  },
};

/*
 * Design notes for whoever picks this up next.
 *
 * - Inherits the locked marketing system: one accent (`brand`), one radius scale
 *   (pills = rounded-full, cards/panels = rounded-3xl, chips = rounded-2xl),
 *   Montserrat display, light theme only. Dark `bg-ink` panels are an emphasis
 *   device already used on the homepage CTA, not a theme flip.
 * - No em-dashes in visible copy, page-wide rule.
 * - Every section is a different layout family on purpose. Nothing here is a
 *   three-equal-cards grid.
 * - Server components throughout, so the page stays statically prerendered.
 * - IMAGERY: real product screenshots (public/marketing/, captured against the
 *   dev demo operator by scripts/marketing_shots.mjs after scripts/
 *   seed_showcase.mjs stages the data). Re-run those two scripts to refresh —
 *   do not replace the shots with div mockups.
 */

/** Nine setup steps, titles pulled from the in-app checklist so they can't drift. */
const SETUP_ORDER: SetupStepKey[] = [
  "location",
  "items",
  "payments",
  "documents",
  "followUps",
  "policies",
  "branding",
  "voice",
  "testDrive",
];

const DOC_TYPES = [
  "Insurance certificate",
  "Business license",
  "Safety inspection",
  "W-9",
  "Permit",
  "Waiver template",
  "Rental agreement",
];

const FAQ = [
  {
    q: "Can I change a booking after it's made?",
    a: "Not yet. Once a booking is made its items and dates are locked, because they hold real inventory and carry a payment against a specific amount, so a change today means cancelling and rebooking. Editing an existing order is on the roadmap and we would rather say that than pretend otherwise.",
  },
  {
    q: "What happens when the assistant can't price something?",
    a: "It stops quoting and hands the conversation to you. The customer is told a human is picking it up, the request lands in your inbox flagged as needing you, and you get an alert. You can then build the quote yourself in a few taps and email it, pre-filled from what the customer already said.",
  },
  {
    q: "Does it work on a phone?",
    a: "The parts you use in the field are built phone-first: the daily route sheet, the inbox, marking a stop delivered, collecting a balance on the doorstep. Your customers' storefront is mobile-first too, since most of them will book from a phone.",
  },
  {
    q: "Who owns my customer data?",
    a: "You do. We process it on your behalf to run your storefront and bookings, and we don't market to your renters or share your customer list. You can see every customer record in the app, and your notes stay private to your team.",
  },
  {
    q: "How long does setup take?",
    a: "An afternoon. A nine-step checklist walks you from an empty account to a live storefront and ticks itself off as you go. The three things that matter first are your service area, a few rentals, and connecting Stripe so you can take money.",
  },
];

export default function FeaturesPage() {
  const groups = liveFeatureGroups();
  const find = (id: string): FeatureGroup | undefined => groups.find((g) => g.id === id);

  return (
    <>
      <Hero groups={groups} />
      <Quoting group={find("quoting")} />
      <Inbox group={find("inbox")} />
      <Storefront group={find("storefront")} />
      <Bookings group={find("bookings")} />
      <Payments group={find("payments")} />
      <TheDay group={find("operations")} />
      <Agents group={find("agents")} />
      <Customers group={find("customers")} />
      <Paperwork group={find("compliance")} />
      <Team group={find("team")} />
      <Security group={find("security")} />
      <Matrix groups={groups} />
      <Close />
    </>
  );
}

/* ---------------------------------------------------------------- hero ----- */

/** Asymmetric split. The right column is the page's contents, which doubles as
 *  the depth signal: eleven areas, all of them shipped. */
function Hero({ groups }: { groups: FeatureGroup[] }) {
  return (
    <section className="relative overflow-hidden">
      <div className="pointer-events-none absolute inset-x-0 -top-24 h-72 bg-gradient-to-b from-brand/5 to-transparent" />
      <div className="mx-auto grid max-w-6xl items-center gap-12 px-5 py-16 sm:px-8 sm:py-24 lg:grid-cols-12">
        <div className="lg:col-span-7">
          <h1 className="font-display text-4xl font-extrabold leading-[1.05] tracking-tighter text-ink sm:text-5xl lg:text-6xl">
            Everything it takes to run a rental business.
          </h1>
          <p className="mt-5 max-w-lg text-lg text-ink-soft">
            Quoting, booking, payments, delivery, and follow-up, automated by an assistant that knows
            your inventory.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
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

        <nav aria-label="Sections on this page" className="lg:col-span-5">
          <ul className="grid grid-cols-2 gap-x-3 gap-y-1 rounded-3xl border border-sand-line bg-white p-4 shadow-xl shadow-ink/5">
            {groups.map((g) => (
              <li key={g.id}>
                <Link
                  href={`#${g.id}`}
                  className="group flex items-center justify-between gap-2 rounded-2xl px-3 py-2 text-sm font-bold text-ink-soft transition-colors hover:bg-cream hover:text-ink"
                >
                  {g.nav}
                  <ArrowUpRight
                    size={13}
                    weight="bold"
                    className="text-ink-faint transition-colors group-hover:text-brand"
                  />
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------- sections ---- */

/** Section heading, shared so every section starts the same way and the layout
 *  underneath is what varies. */
function Heading({
  group,
  tone = "ink",
  className = "",
}: {
  group: FeatureGroup;
  tone?: "ink" | "white";
  className?: string;
}) {
  const head = tone === "white" ? "text-white" : "text-ink";
  const body = tone === "white" ? "text-cream/70" : "text-ink-mute";
  return (
    <div className={className}>
      <h2 className={`font-display text-3xl font-extrabold tracking-tighter sm:text-4xl ${head}`}>
        {group.headline}
      </h2>
      <p className={`mt-3 max-w-xl text-lg ${body}`}>{group.body}</p>
    </div>
  );
}

/** Tinted band. Heading on the left, proof as a divided run of prose on the right. */
function Quoting({ group }: { group?: FeatureGroup }) {
  if (!group) return null;
  return (
    <section id={group.id} className="scroll-mt-24 border-y border-sand-line bg-brand/[0.035]">
      <div className="mx-auto grid max-w-6xl gap-10 px-5 py-16 sm:px-8 sm:py-24 lg:grid-cols-12">
        <div className="lg:col-span-5">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand text-white">
            <Sparkle size={24} weight="fill" />
          </span>
          <Heading group={group} className="mt-5" />
        </div>
        <div className="divide-y divide-brand/10 lg:col-span-7">
          {group.highlights.map((h) => (
            <p key={h.title} className="py-5 text-[15px] leading-relaxed text-ink-soft first:pt-0 last:pb-0">
              <b className="font-display text-base font-bold text-ink">{h.title}. </b>
              {h.body}
            </p>
          ))}
        </div>
        <Shot
          src="/marketing/quote-chat.png"
          alt="A storefront chat where the AI answers an availability question with a priced quote card"
          width={1800}
          height={1800}
          caption="A live storefront quote: item matched, date checked, deposit computed."
          className="mx-auto mt-2 w-full max-w-2xl lg:col-span-12"
        />
      </div>
    </section>
  );
}


/** A real product screenshot in the standard marketing frame. Dimensions are
 *  the PNG's intrinsic 2x pixels; captions are plain and functional. */
function Shot({
  src,
  alt,
  width,
  height,
  caption,
  className = "",
  imgClassName = "",
}: {
  src: string;
  alt: string;
  width: number;
  height: number;
  caption: string;
  className?: string;
  imgClassName?: string;
}) {
  return (
    <figure className={className}>
      <div className="overflow-hidden rounded-3xl border border-sand-line bg-white shadow-xl shadow-ink/5">
        <Image src={src} alt={alt} width={width} height={height} className={`w-full ${imgClassName}`} />
      </div>
      <figcaption className="mt-3 text-center text-[13px] font-medium text-ink-soft">{caption}</figcaption>
    </figure>
  );
}

/** How many leading tiles span two columns so a two-column grid always fills
 *  exactly, whatever the live highlight count turns out to be. */
function wideCount(n: number): number {
  return n % 2 === 1 ? 1 : 2;
}

/** Bento with mixed tile weights. Cell count always resolves to a full grid. */
function Inbox({ group }: { group?: FeatureGroup }) {
  if (!group) return null;
  const wide = wideCount(group.highlights.length);
  return (
    <section id={group.id} className="scroll-mt-24">
      <div className="mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-24">
        <Heading group={group} />
        <Shot
          src="/marketing/inbox.png"
          alt="The Movables inbox: inquiry list beside an open thread the AI is handling"
          width={2880}
          height={1600}
          caption="One inbox: the AI answers, flags what needs you, and you can take over any thread."
          className="mt-12"
        />
        <div className="mt-10 grid grid-cols-1 gap-5 md:grid-cols-2">
          {group.highlights.map((h, i) => {
            const isWide = i < wide;
            return (
              <div
                key={h.title}
                className={`rounded-3xl p-7 ${
                  isWide
                    ? "border border-brand/15 bg-gradient-to-br from-brand/[0.08] to-brand/[0.02] md:col-span-2"
                    : "border border-sand-line bg-white"
                }`}
              >
                {isWide ? (
                  <span className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-brand text-white">
                    <ChatCircleText size={22} weight="fill" />
                  </span>
                ) : null}
                <h3 className="font-display text-xl font-bold text-ink">{h.title}</h3>
                <p className="mt-1.5 max-w-2xl text-sm text-ink-soft">{h.body}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/** Editorial rows: short label left, body right, hairline between. */
function Storefront({ group }: { group?: FeatureGroup }) {
  if (!group) return null;
  return (
    <section id={group.id} className="scroll-mt-24 border-y border-sand-line bg-cream-2">
      <div className="mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-24">
        <Heading group={group} />
        <Shot
          src="/marketing/storefront.png"
          alt="A branded storefront with the AI chat beside a browsable catalog with live availability"
          width={2400}
          height={1600}
          caption="Your storefront: chat on the left, catalog with live availability on the right."
          className="mt-12"
        />
        <dl className="mt-8 divide-y divide-sand">
          {group.highlights.map((h) => (
            <div key={h.title} className="grid gap-2 py-6 md:grid-cols-12 md:gap-8">
              <dt className="font-display text-xl font-bold text-ink md:col-span-4">{h.title}</dt>
              <dd className="text-[15px] leading-relaxed text-ink-soft md:col-span-8">{h.body}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}

/** Dark emphasis panel. The credibility beat, so it gets the loudest surface. */
function Bookings({ group }: { group?: FeatureGroup }) {
  if (!group) return null;
  const wide = wideCount(group.highlights.length);
  return (
    <section id={group.id} className="scroll-mt-24 px-5 py-16 sm:px-8 sm:py-24">
      <div className="mx-auto max-w-6xl overflow-hidden rounded-3xl bg-ink px-7 py-14 sm:px-12">
        <Heading group={group} tone="white" />
        <div className="mt-10 grid gap-x-10 gap-y-8 sm:grid-cols-2">
          {group.highlights.map((h, i) => (
            <div key={h.title} className={i < wide ? "sm:col-span-2" : ""}>
              <h3 className="font-display text-lg font-bold text-white">{h.title}</h3>
              <p className={`mt-1.5 text-sm text-cream/70 ${i < wide ? "max-w-2xl" : ""}`}>{h.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/** Paired columns, then the strongest single claim as a full-width banner. */
function Payments({ group }: { group?: FeatureGroup }) {
  if (!group) return null;
  const odd = group.highlights.length % 2 === 1;
  const columns = odd ? group.highlights.slice(0, -1) : group.highlights;
  const banner: Highlight | null = odd ? group.highlights[group.highlights.length - 1] : null;
  return (
    <section id={group.id} className="scroll-mt-24">
      <div className="mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-24">
        <Heading group={group} />
        <div className="mt-12 grid gap-x-10 gap-y-9 sm:grid-cols-2">
          {columns.map((h) => (
            <div key={h.title}>
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand/10 text-brand">
                <CreditCard size={22} weight="fill" />
              </span>
              <h3 className="mt-4 font-display text-xl font-bold text-ink">{h.title}</h3>
              <p className="mt-1.5 text-sm text-ink-soft">{h.body}</p>
            </div>
          ))}
        </div>
        {banner ? (
          <div className="mt-10 rounded-3xl border border-sand-line bg-gradient-to-r from-cream-2 to-brand/5 p-7">
            <h3 className="font-display text-xl font-bold text-ink">{banner.title}</h3>
            <p className="mt-1.5 max-w-2xl text-sm text-ink-soft">{banner.body}</p>
          </div>
        ) : null}
      </div>
    </section>
  );
}

/** Four across, divided by vertical hairlines at desktop. */
function TheDay({ group }: { group?: FeatureGroup }) {
  if (!group) return null;
  return (
    <section id={group.id} className="scroll-mt-24 border-y border-sand-line bg-cream-2">
      <div className="mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-24">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <Heading group={group} />
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-brand text-white">
            <Truck size={24} weight="fill" />
          </span>
        </div>
        <div className="mt-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-4 lg:gap-0 lg:divide-x lg:divide-sand">
          {group.highlights.map((h) => (
            <div key={h.title} className="lg:px-6 lg:first:pl-0 lg:last:pr-0">
              <h3 className="font-display text-lg font-bold text-ink">{h.title}</h3>
              <p className="mt-1.5 text-sm text-ink-soft">{h.body}</p>
            </div>
          ))}
        </div>
        <Shot
          src="/marketing/routes.png"
          alt="The day's delivery route on a phone: timed stops with map, call, and text shortcuts"
          width={840}
          height={1720}
          caption="The route sheet your driver actually uses, on the phone already in their pocket."
          className="mx-auto mt-12 w-full max-w-[340px]"
          imgClassName="rounded-3xl"
        />
      </div>
    </section>
  );
}

/** Roster rows: one row per agent, with the shared operating rules underneath. */
function Agents({ group }: { group?: FeatureGroup }) {
  if (!group) return null;
  const roster = group.highlights.slice(0, -1);
  const rules = group.highlights[group.highlights.length - 1];
  return (
    <section id={group.id} className="scroll-mt-24">
      <div className="mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-24">
        <Heading group={group} />
        <Shot
          src="/marketing/agents.png"
          alt="The Agents page: each automation with its activity count and an on/off toggle"
          width={2000}
          height={1520}
          caption="Each agent shows its work — and any of them can be switched off."
          className="mx-auto mt-12 max-w-3xl"
        />
        <div className="mt-10 overflow-hidden rounded-3xl border border-sand-line bg-white">
          <div className="divide-y divide-sand-line">
            {roster.map((h) => (
              <div key={h.title} className="grid gap-2 p-6 sm:grid-cols-12 sm:gap-6 sm:p-7">
                <h3 className="font-display text-lg font-bold text-ink sm:col-span-4">{h.title}</h3>
                <p className="text-sm text-ink-soft sm:col-span-8">{h.body}</p>
              </div>
            ))}
          </div>
          <div className="border-t border-sand-line bg-cream-2 p-6 sm:p-7">
            <h3 className="font-display text-lg font-bold text-ink">{rules.title}</h3>
            <p className="mt-1.5 max-w-3xl text-sm text-ink-soft">{rules.body}</p>
          </div>
        </div>
      </div>
    </section>
  );
}

/** Asymmetric: one large claim, the rest stacked beside it. */
function Customers({ group }: { group?: FeatureGroup }) {
  if (!group) return null;
  const [lead, ...rest] = group.highlights;
  return (
    <section id={group.id} className="scroll-mt-24 border-y border-sand-line bg-cream-2">
      <div className="mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-24">
        <Heading group={group} />
        <Shot
          src="/marketing/customer.png"
          alt="A customer profile with booking totals, private notes, and rental history"
          width={2200}
          height={1440}
          caption="A repeat customer's record: totals, private notes, and every past rental."
          className="mt-12"
        />
        <div className="mt-10 grid gap-10 lg:grid-cols-12">
          <div className="rounded-3xl border border-brand/15 bg-gradient-to-br from-brand/[0.08] to-brand/[0.02] p-8 lg:col-span-7">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand text-white">
              <UsersThree size={24} weight="fill" />
            </span>
            <h3 className="mt-5 font-display text-2xl font-bold tracking-tight text-ink">{lead.title}</h3>
            <p className="mt-2 text-[15px] leading-relaxed text-ink-soft">{lead.body}</p>
          </div>
          <div className="divide-y divide-sand lg:col-span-5">
            {rest.map((h) => (
              <div key={h.title} className="py-5 first:pt-0 last:pb-0">
                <h3 className="font-display text-lg font-bold text-ink">{h.title}</h3>
                <p className="mt-1 text-sm text-ink-soft">{h.body}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/** Two columns: the claims, and the real list of what the library holds. */
function Paperwork({ group }: { group?: FeatureGroup }) {
  if (!group) return null;
  return (
    <section id={group.id} className="scroll-mt-24">
      <div className="mx-auto grid max-w-6xl gap-10 px-5 py-16 sm:px-8 sm:py-24 lg:grid-cols-12">
        <div className="lg:col-span-7">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand text-white">
            <Files size={24} weight="fill" />
          </span>
          <Heading group={group} className="mt-5" />
          <div className="mt-8 divide-y divide-sand-line">
            {group.highlights.map((h) => (
              <p key={h.title} className="py-4 text-[15px] leading-relaxed text-ink-soft first:pt-0 last:pb-0">
                <b className="font-display text-base font-bold text-ink">{h.title}. </b>
                {h.body}
              </p>
            ))}
          </div>
        </div>
        <div className="lg:col-span-5">
          <div className="rounded-3xl border border-sand-line bg-white p-7">
            <h3 className="font-display text-lg font-bold text-ink">What the library holds</h3>
            <ul className="mt-4 flex flex-wrap gap-2">
              {DOC_TYPES.map((t) => (
                <li
                  key={t}
                  className="rounded-full border border-sand-line bg-cream px-3.5 py-1.5 text-[13px] font-bold text-ink-soft"
                >
                  {t}
                </li>
              ))}
            </ul>
            <p className="mt-5 text-sm text-ink-soft">
              Insurance, licenses, inspections, and permits are the four we watch for expiry.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

/** Two unequal panels: the roles story, and the real setup checklist. */
function Team({ group }: { group?: FeatureGroup }) {
  if (!group) return null;
  return (
    <section id={group.id} className="scroll-mt-24 border-y border-sand-line bg-cream-2">
      <div className="mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-24">
        <Heading group={group} />
        <div className="mt-12 grid gap-6 lg:grid-cols-12">
          <div className="grid gap-7 rounded-3xl border border-sand-line bg-white p-8 sm:grid-cols-2 lg:col-span-7">
            {group.highlights.map((h) => (
              <div key={h.title}>
                <h3 className="font-display text-lg font-bold text-ink">{h.title}</h3>
                <p className="mt-1.5 text-sm text-ink-soft">{h.body}</p>
              </div>
            ))}
          </div>
          <div className="rounded-3xl border border-brand/15 bg-gradient-to-br from-brand/[0.08] to-brand/[0.02] p-8 lg:col-span-5">
            <h3 className="font-display text-lg font-bold text-ink">The nine steps</h3>
            <ul className="mt-4 space-y-2.5">
              {SETUP_ORDER.map((key) => (
                <li key={key} className="flex items-start gap-2.5 text-sm font-semibold text-ink-soft">
                  <Check size={17} weight="bold" className="mt-0.5 shrink-0 text-brand" />
                  {SETUP_STEPS[key].title}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}

/** Quiet prose block. This section earns trust, so it does not shout. */
function Security({ group }: { group?: FeatureGroup }) {
  if (!group) return null;
  return (
    <section id={group.id} className="scroll-mt-24">
      <div className="mx-auto max-w-3xl px-5 py-16 sm:px-8 sm:py-24">
        <Heading group={group} />
        <div className="mt-8 space-y-5">
          {group.highlights.map((h) => (
            <p key={h.title} className="text-[15px] leading-relaxed text-ink-soft">
              <b className="font-display text-base font-bold text-ink">{h.title}. </b>
              {h.body}
            </p>
          ))}
        </div>
      </div>
    </section>
  );
}

/** The way through to the lookup. The matrix itself lives on its own page so
 *  this one stays a read rather than a scroll past a hundred table rows. */
function Matrix({ groups }: { groups: FeatureGroup[] }) {
  const rows = groups.reduce((n, g) => n + g.capabilities.length, 0);
  return (
    <section id="everything" className="scroll-mt-24 border-y border-sand-line bg-cream-2">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-5 py-16 sm:flex-row sm:items-center sm:justify-between sm:px-8 sm:py-20">
        <div>
          <h2 className="font-display text-3xl font-extrabold tracking-tighter text-ink sm:text-4xl">
            The whole list, plan by plan
          </h2>
          <p className="mt-3 max-w-xl text-lg text-ink-mute">
            All {rows} capabilities, grouped and compared across the three plans.
          </p>
        </div>
        <Link
          href="/features/all"
          className="inline-flex shrink-0 items-center gap-2 rounded-full bg-ink px-6 py-3 text-sm font-bold text-cream transition-colors hover:bg-ink-deep active:translate-y-px"
        >
          See the full list <ArrowRight size={16} weight="bold" />
        </Link>
      </div>
    </section>
  );
}

/** Pricing, questions, and the one CTA the page has been building toward. */
function Close() {
  return (
    <>
      <section id="pricing" className="scroll-mt-24">
        <div className="mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-24">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="font-display text-3xl font-extrabold tracking-tighter text-ink sm:text-4xl">
              Three plans, one of them free
            </h2>
            <p className="mt-3 text-lg text-ink-mute">
              Start free and upgrade when you&apos;re booking more than you can count.
            </p>
          </div>
          <div className="mt-12">
            <PricingTiers />
          </div>
          <p className="mt-6 text-center text-[13px] font-medium text-ink-soft">
            Paid plans include a 14-day free trial. No credit card on Free.
          </p>
          <div className="mt-4 text-center">
            <Link href="/pricing" className="text-sm font-bold text-brand hover:text-brand-deep">
              Compare plans in detail
            </Link>
          </div>
        </div>
      </section>

      <section className="border-y border-sand-line bg-cream-2">
        <div className="mx-auto max-w-3xl px-5 py-16 sm:px-8 sm:py-24">
          <h2 className="font-display text-3xl font-extrabold tracking-tighter text-ink sm:text-4xl">
            Questions we get asked
          </h2>
          <div className="mt-10 divide-y divide-sand-line rounded-3xl border border-sand-line bg-white">
            {FAQ.map((item) => (
              <div key={item.q} className="p-6">
                <h3 className="font-display text-lg font-bold text-ink">{item.q}</h3>
                <p className="mt-1.5 text-sm text-ink-soft">{item.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="px-5 py-20 sm:px-8">
        <div className="mx-auto max-w-6xl overflow-hidden rounded-3xl bg-ink px-8 py-14 text-center sm:py-20">
          <h2 className="mx-auto max-w-2xl font-display text-3xl font-extrabold tracking-tighter text-white sm:text-4xl">
            Put the whole thing to work this weekend
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-lg text-cream/70">
            Your catalog, your storefront, and an assistant that answers while you&apos;re on a job.
          </p>
          <SignupCta
            plan="free"
            className="mt-8 inline-flex items-center gap-2 rounded-full bg-cream px-7 py-3.5 text-sm font-bold text-ink transition-colors hover:bg-white active:translate-y-px"
          >
            Start free <ArrowRight size={16} weight="bold" />
          </SignupCta>
        </div>
      </section>
    </>
  );
}
