# Marketing / sales page plan — "Everything Movables does"

_Planned 2026-08-17. Scope: one long-form, deep-detail sales page for prospective **operators**, complementing the concise homepage (`/`) and the plan-comparison page (`/pricing`)._

## Assumptions (stated, not blocking)

1. **Audience = operators** (the people who rent out bounce houses / party & event equipment), not renters. The `(marketing)` route group already sells to operators; this page is the same funnel, one level deeper.
2. **Route = `/features`**, inside the existing `(marketing)` route group, statically prerendered like `/` and `/pricing`. It becomes the destination for the header's "Features" link (today `/#features`, an anchor into a 6-tile bento).
3. **The homepage stays short.** This page is where a serious evaluator goes to answer "does it do the thing I need?" — so it is allowed to be long, dense, and scannable. The homepage keeps converting on emotion; this page converts on completeness.
4. Every CTA goes through the existing `<SignupCta>`, so the one `NEXT_PUBLIC_SIGNUPS_OPEN` flag keeps flipping the whole page between "Start free" and "Request early access."

## Why a page like this earns its place

Today a prospect can learn six things about the product (`/` bento) and three plan prices (`/pricing`). What they cannot learn is that Movables also has a CRM with lead tracking, an atomic no-oversell reserve, a driver route sheet, a document library with expiry watch, discount + auto-promo engine, an embeddable widget, RBAC with a money-in/money-out split, and four automated follow-up agents. **The product is far deeper than the site admits**, and depth is the argument against the incumbents (Goodshuffle, Rentman, Event Rental Systems, spreadsheets + a phone). This page is where the depth gets said out loud.

---

## Page structure

Eleven sections, plus a sticky in-page anchor nav (the page is long enough to need it). Each section below gives: **purpose · headline draft · proof points (all mapped to shipped code) · visual · layout family.**

Layout families are deliberately varied — the `/` design pass (2026-07-29) already found that four 3-column card grids in a row is the biggest "generic AI page" tell. Same discipline here: no two adjacent sections share a layout.

### 0. Sticky anchor nav

Purpose: make a long page navigable and signal depth immediately. A thin sub-header under `MarketingHeader` with anchors: Quoting · Inbox · Storefront · Bookings · Payments · Operations · Agents · Customers · Compliance · Team · Security · Pricing. Scroll-spy is a nice-to-have, not required for v1 (would make the page a client component; prefer plain anchors + `scroll-mt-32` and keep it a server component).

### 1. Hero — the whole product in one sentence

- **Headline:** "Everything it takes to run a rental business, in one place."
- **Subhead (≤20 words, per the existing copy rule):** "Quoting, booking, payments, contracts, delivery, and follow-up — automated by an assistant that knows your inventory."
- **Body:** one short paragraph naming the shape of the product: _"Movables is the storefront your customers book on, the inbox your team works from, and the AI that answers the moment a request lands."_
- **CTAs:** `<SignupCta plan="free">Start free</SignupCta>` + "See pricing".
- **Trust line:** "No credit card required · Free plan forever · Set up in an afternoon."
- **Visual:** the strongest single product screenshot available. Prefer a real storefront chat + quote card over the hand-built `<div>` mock (the mock is already logged as a known design tell in the roadmap).
- **Layout:** two-column, mirroring `/` so the pages feel like one site.

### 2. Quoting — the wedge

- **Headline:** "An assistant that quotes like your best employee."
- **Purpose:** this is the differentiator; give it the most room of any section.
- **Proof points:**
  - Answers in plain language and returns a **real, bookable quote** — priced from your live catalog, your rates, your tax setup, your delivery pricing. Prices are computed by the system, never invented by the model.
  - Knows your **actual constraints**: service area, operating days, delivery windows, blackout dates, minimum lead time, deposit terms, and any active promos are assembled from your settings on every conversation — so it won't promise a closed Sunday, a blacked-out weekend, a same-day booking inside your lead time, or a delivery outside your area.
  - **Brief it in your own words.** A free-text instruction field shapes voice, house rules, and item-specific safety guidance; the core conduct (safety over sales, no invented discounts, escalate rather than guess, respect a "no") is built in for every operator.
  - **Knows when to get you.** Over your auto-quote cap, or off-script, it stops quoting, captures the lead, alerts you, and tells the customer a human is on it — never a dead end.
  - **Quote → checkout is one step**: the quote card is bookable, so an answered question becomes a paid reservation without a callback.
- **Visual:** an annotated conversation showing (a) the question, (b) the priced quote card, (c) the "book it" action — with callouts to "your real inventory" / "your real prices" / "your real rules."
- **Layout:** wide chat transcript with margin callouts (a distinct family — nothing else on the page looks like this).

### 3. Inbox — one place for every conversation

- **Headline:** "Every request, every channel, one inbox."
- **Proof points:**
  - Web chat, text messages, and email replies land in the **same thread** — full chronological history, not a one-shot form.
  - **AI answers first, always.** Nobody waits. Every inquiry gets a response even at 11pm on a Saturday.
  - **Hand off both ways.** Take over a thread and the AI steps back; hand it back and it picks up. While you're driving it, the AI stays on as a copilot and drafts the reply for you to send or edit.
  - **Live** — messages stream in without a refresh; channel badges show where each one came from; one person texting *and* emailing is recognized as one person.
  - **Did it convert?** Each inquiry shows its outcome — Booked / Checkout started / No booking yet — with the amount and a link to the booking. Auto-answered threads you never read are still measurable.
  - Filter to "Needs you" so the AI-handled volume stays out of your way.
- **Visual:** inbox list + thread detail, with the channel badges and the outcome banner visible.
- **Layout:** app screenshot (large, single) with 4 short proof captions beneath it.
- ⚠️ **Copy constraint:** SMS is code-complete but **dark until Twilio + A2P 10DLC is configured**, and Messenger / WhatsApp / Instagram are **not built**. See "Claim discipline" below.

### 4. Storefront — the booking page (and the widget)

- **Headline:** "A booking page your customers actually finish."
- **Proof points:** branded catalog (your logo, color, tagline) · multi-photo items with a lightbox carousel · item detail pages with space needed (W×L×H), power requirements, and description · **date-aware availability** ("4 available Sat June 20") · cart · guest-first (browse, quote, and check out with no account) · save/wishlist and conversation resume for returning customers who do sign in · a renter portal at `/my` where a customer sees their bookings across every operator they've rented from, their payment history, their balance due, and their contract status.
- **Bring your own website:** a copy-paste `<script>` snippet drops the whole storefront into your existing site, locked to your domains; a public API (catalog + agent endpoints, publishable/secret keys) is there if your developer wants to build the front end themselves. _(Growing plan.)_
- **Visual:** storefront on desktop + phone, plus a small code-snippet card for the embed.
- **Layout:** alternating text/visual rows (2 rows), then a narrow full-width "or embed it" strip.

### 5. Bookings — the math that stops the Saturday disaster

- **Headline:** "You will not double-book your last bounce house."
- **Purpose:** the credibility section. Operators have all been burned; specificity wins here.
- **Proof points:**
  - Availability is computed on **peak overlap across the whole rental range**, not a naive day count — multi-day rentals, back-to-back weekends, and partial overlaps all resolve correctly.
  - The reservation is **atomic in the database**. Two people checking out for the last unit at the same time serialize; one wins, the other is told immediately it just sold out. Not "usually fine" — enforced.
  - Abandoned checkouts release their hold automatically, so a dead cart never eats your Saturday inventory.
  - Stock is **real**: owned units minus what's out, damaged, in repair, or needing cleaning — so "available" means bookable.
  - Every item detail page shows a forward 60-day availability window and exactly which bookings are holding it.
  - One calendar for everything; a booking builder for phone and walk-in orders (send a pay link, or record it as booked for cash).
- **Visual:** the calendar, plus a diagram of the oversell race (two checkouts → one reservation → "just sold out").
- **Layout:** a single dark, high-contrast panel — visually the "engineering" beat of the page.
- **Note:** this section is the natural home for a short, honest limitation line if you want one (an existing booking's items/dates can't be edited yet — today it's cancel + re-book). Recommended: leave it off the sales page, keep it in the FAQ if asked.

### 6. Payments — money in, money out

- **Headline:** "Get paid before the truck leaves."
- **Proof points:** deposits or full payment at checkout · money lands in **your** bank account via Stripe, not held by us · collect the remaining balance in a tap, by card or marked as cash · refunds and cancellations from the booking (cancelling frees the inventory) · cash payments recorded as real transactions so your totals are true · flexible sales tax (rental vs delivery taxable, separately) · delivery priced flat, by zone, or by distance from a geocoded address · discount codes (% or $, expiry, minimum, usage cap) and **automatic promos** (weekday deals, repeat-customer discounts) that apply themselves, best single discount only, no stacking surprises.
- **Contracts:** the rental agreement is sent for e-signature the moment a booking is paid, named to **your** business as the counterparty, with your cancellation and damage policies carried into the document — and the same policies shown at checkout and in the confirmation email, so nobody signs something they haven't already seen.
- **Visual:** checkout summary → confirmation email → signed-agreement status, as a 3-beat strip.
- **Layout:** two-column feature list (money in / money out), then the contract beat as a full-width banner.
- ⚠️ **Copy constraint:** contracts are **live-flippable but currently off in production** (test mode, auto-send disabled, template text pending counsel). Do not ship contract copy in the present tense until item 4 of the Go-Live Checklist is done.

### 7. Operations — running the day

- **Headline:** "The day's route, on the phone in your driver's hand."
- **Proof points:** a mobile-first daily route sheet of drop-offs and pick-ups, ordered by delivery window, each stop with the customer, items, address, one-tap Open in Maps, one-tap call or text, and mark delivered / picked up (which advances the booking and updates the calendar and dashboard) · a day switcher for tomorrow's plan · a dashboard with today at a glance, month revenue and insights, discounts given, and warnings that need you · every date computed in **your** timezone, so "today" means today.
- **Visual:** the route sheet on a phone, at real size, next to the desktop dashboard.
- **Layout:** phone-first — a large device frame with a tight bulleted list beside it.

### 8. Agents — the automated team

- **Headline:** "Four things that chase money and paperwork while you sleep."
- **Purpose:** this is the highest-leverage revenue story on the page and currently invisible on the site. Present it the way the in-app Agents page does: a hireable team, each with a job description, a schedule, and its work on display.
- **Proof points (verbatim-aligned with the product):**

  | Agent | Job | Runs |
  |---|---|---|
  | Payment Follow-up | Emails an unpaid balance a few days before the event, with a secure pay link | Nightly · once per booking, ever |
  | Quote Follow-up | Checks in on a quote that hasn't booked after 3 days, with the link to reserve — warm, never pushy | Nightly · once per quote, ever |
  | Contract Follow-up | Nudges an unsigned agreement after 48 hours and re-sends the signing email | Nightly · once per booking, ever |
  | Compliance Watch | Warns you two weeks before insurance, a license, a permit, or an inspection expires | Nightly · **free on every plan** |

  Plus: each agent shows live activity from its own send log, they speak in **your** business's voice (same brief as the quote assistant), they're **off by default** (nothing sends without you switching it on), and each one emails a given customer **once, ever** — no nagging loops.
- **Visual:** the Agents page itself — the cards with their toggles and activity counts.
- **Layout:** the table above + a screenshot. The plan gate (three are Solo+, Compliance Watch is free) is stated inline and again in the matrix.

### 9. Customers — the CRM you didn't have to build

- **Headline:** "Every customer, every conversation, every dollar."
- **Proof points:** one record per customer, deduped across bookings, inquiries, texts, and storefront signups · what they've actually paid (net of refunds), what they've booked, how many times, what's upcoming · a timeline of their bookings and conversations · real payment history per booking, card **and** cash · private notes only you see · one-tap email, call, or **book again** · and **leads** — someone who saved an item or asked a question but never booked is now a person you can see and follow up with, tagged with what they did.
- **Visual:** customer profile with the stat row and the activity timeline.
- **Layout:** single wide screenshot with 3 stat callouts overlaid.

### 10. Compliance & paperwork

- **Headline:** "The binder in the truck, minus the binder."
- **Proof points:** a **private** document library (insurance certificates, business license, safety inspections, W-9s, permits, waivers, contracts) · downloads via short-lived signed links, never a public URL · expiry dates tracked, with a dashboard warning and an email two weeks out · attach a document to a specific booking or customer · your cancellation and damage policies written once and rendered everywhere they matter (checkout, emails, the contract).
- **Layout:** small, dense — a 2-column list plus one screenshot. This section earns trust, not excitement; keep it tight.

### 11. Team, roles & setup

- **Headline:** "Bring your crew in, without handing over the books."
- **Proof points:** Admin and Employee roles · **money in, not money out** — an employee can collect a balance and take cash, but cannot refund or cancel · aggregate revenue hidden from employees while per-booking totals stay visible · invite by email, change roles, remove (with a last-admin guard) · one person can belong to several businesses and switch between them · everyone manages their own name, email, and password.
- **Setup story (fold in here rather than its own section):** a **nine-step "Get set up" checklist** that ticks itself off as you work — service area, rentals, payouts, compliance docs, follow-ups, policies, branding, briefing the assistant, and a test drive of your own storefront. No onboarding call, no installer.
- **Layout:** two-column — roles table left, checklist right.

### 12. Security & reliability

- **Headline:** "Built like it's holding your customers' data. It is."
- **Proof points (state plainly, no jargon inflation):** every business's data is isolated **at the database level**, not just in application code · payments run through Stripe (we never see a card number) · your customers' data is yours — we process it on your behalf and don't market to your renters · e-signature through a dedicated provider · the money paths (checkout, webhooks, reservations) are idempotent and covered by an automated test suite that gates every deploy · hosted on Vercel and Supabase with error monitoring.
- **Layout:** a quiet 4-up strip of short claims. No screenshot.

### 13. Full capability matrix

Purpose: the "does it do X?" lookup, and the answer to a spec-sheet comparison. One table, ~50 rows, grouped by the sections above, with three plan columns (Free / Solo / Growing). This is what lets sections 2–12 stay readable prose — anything that doesn't fit a narrative goes here.

**Generate it from data, not prose** (see Implementation notes) so the plan columns can never contradict billing.

### 14. Pricing teaser + FAQ + final CTA

- Reuse `<PricingTiers />` verbatim (already DRY from `lib/plans`), then "Compare plans in detail →" to `/pricing`.
- 5–6 FAQs specific to this page (not duplicating `/pricing`'s): _Do I need my own Stripe account? · Can I keep my current website? · What if a customer wants something the AI can't price? · Can I change a booking after it's made? · Do my customers need an account? · Who owns my customer data?_
- Final CTA on the existing dark `bg-ink` panel, same as `/`.

---

## Claim discipline (the one real risk on this page)

A sales page is a promise. Several features are **code-complete but dark in production**, gated on config rather than engineering. Shipping present-tense copy for those is how you end up with a prospect holding a screenshot of something that doesn't happen.

| Capability | Reality today | Recommended copy stance |
|---|---|---|
| E-signed contracts | Built + validated in **test mode**; auto-send off in prod; template text pending counsel review | **Best: finish Go-Live item 4 before publishing.** Otherwise say "e-signature is included" without "automatically, the moment they pay." |
| SMS / two-way texting | Full AI loop built; **dark** until Twilio + A2P 10DLC registration | Say "web chat and email today, texting as soon as your number is registered" — or omit SMS and add it at launch. Do not put "text messages" in a channel list. |
| Messenger / WhatsApp / Instagram | **Not built** | Do not mention. Not even "coming soon" — roadmap promises on a sales page get quoted back to you. |
| Packages / bundles | **Not built** (catalog-model work) | Do not mention. |
| Custom storefront domain (`book.yoursite.com`) | **Not built** | Do not mention. The embed widget is the honest answer to "keep my own site." |
| Editing a booking's items/dates | **Not possible** — cancel + re-book | Don't advertise editing. Answer honestly in the FAQ if you include that question. |
| Reviews, analytics dashboard, CRM sync | **Not built** | Omit. |
| Live Stripe / real payouts | Test keys in prod; Connect not enabled in live mode | Payments copy is fine (the flow is real), but **don't publish this page as a live funnel until Stripe is live** — the moment it converts, it needs to take money. |
| Signups | **Closed** (waitlist / early-access mailto) | Fine — `<SignupCta>` already handles both states. But write the trust line so it isn't absurd next to "Request early access": consider a variant line ("Early access · no credit card") driven by the same flag. |
| Testimonials, operator counts, "X% more bookings" | **None exist** | **Invent nothing.** No fake logos, no made-up stats, no placeholder quotes. If you want a proof beat, use a real product artifact (a real quote in a real conversation) instead of social proof you don't have yet. Add testimonials when Bounce USA has results worth quoting. |

---

## Implementation notes

**Files**

| Path | Change |
|---|---|
| `src/app/(marketing)/features/page.tsx` | New page. Server component, static (`○`), `export const metadata`. |
| `src/lib/marketing/features.ts` | **New.** The single source for the capability matrix + section proof points. |
| `src/components/marketing/FeatureMatrix.tsx` | **New.** Renders the matrix from that data; plan columns derived, not typed. |
| `src/components/marketing/AnchorNav.tsx` | **New.** Sticky in-page nav. |
| `src/components/marketing/MarketingHeader.tsx` | Repoint "Features" from `/#features` → `/features`. |
| `src/components/marketing/MarketingFooter.tsx` | Same repoint; the `/` bento can keep its `#features` id as a secondary anchor. |
| `src/app/(marketing)/page.tsx` | Add a "See everything it does →" link under the feature bento. |
| `src/app/sitemap.ts` | Add `/features`. |

**Don't let the matrix drift from billing.** The pricing page is already DRY from `lib/plans` — the roadmap's domain DECISION calls that out as the structural reason marketing lives in the app at all. Hold the new matrix to the same standard: tag each row with the capability it depends on (`maxItems`, `aiQuotesPerMonth`, `teamMembers`, `apiAccess`, `followUpAgents`) and derive the ✓/— from `PLAN_CAPABILITIES` rather than hand-typing three columns. Rows with no capability key are "every plan." A future plan change then updates the sales page automatically, and a mis-sold feature becomes impossible rather than merely unlikely.

**Gate the not-yet-live rows in one place.** Give each feature row an optional `live: boolean` (or key it off the same env flags the product uses — `SIGNWELL_AUTO_SEND`, `TWILIO_*`). One switch to flip when contracts and SMS go live, instead of hunting prose. Note these are server-only env reads on a static page, which is fine — they're build-time.

**Design constraints, inherited from the `/` audit (keep these):**
- One accent (`brand`). Teal only as a live/status dot.
- One radius scale: pills `rounded-full`, cards/panels `rounded-3xl`, chips `rounded-2xl`.
- No em/en-dashes in visible copy.
- No two adjacent sections in the same layout family.
- Subheads ≤20 words.
- Display font stays **Montserrat** (matches the logo).

**Assets — the gating dependency.** This page needs roughly 8–10 real screenshots (storefront chat + quote card, inbox thread with badges, calendar, booking detail, route sheet on a phone, Agents page, customer profile, documents, settings, the setup checklist) and ideally 2–3 real photos of set-up equipment. The `/` design pass already flagged zero photography as the single biggest "generic SaaS" driver, and a features page made of `<div>` mockups will read worse than one with fewer, real images. **Recommended: capture screenshots from the Bounce USA tenant with a demo-safe data pass** (real-looking names, no actual customer PII), at 2× on a fixed viewport, and store them in `public/marketing/`. Use `next/image`.

**Performance / SEO:** static prerender; images as `next/image` with explicit dimensions; `metadata` with a distinct title/description plus OG image (the OG-image gap is already tracked on the roadmap); one `<h1>`, `<h2>` per section, and the matrix as a real `<table>` so it's machine-readable. Target: fully static, no client JS unless the anchor nav gets scroll-spy.

**Motion (optional, after v1):** scroll-reveal on section entry and hover lift on cards, reduced-motion-gated, per the deferred motion item on the roadmap. The page is long — restrained reveal actually helps pacing here more than it does on `/`.

---

## As built (2026-08-17)

Steps 1, 2, 4 and 5 of the build order below are **done**; step 3 (imagery) is the remaining work.

| Shipped | Detail |
|---|---|
| `src/lib/marketing/features.ts` | 11 groups, 51 prose highlights, 113 matrix rows authored (108 render with contracts and SMS currently dark). Plan columns derive from `PLAN_CAPABILITIES`; `live` predicates gate anything switched off. |
| `src/components/marketing/FeatureMatrix.tsx` | One small table **per group** rather than a single hundred-row spec sheet, so each block carries its own plan header and needs no sticky thead. |
| `src/app/(marketing)/features/page.tsx` | The narrative: 11 pillar sections, each a different layout family, plus pricing, FAQ, and CTA. Ends with a band through to the full list. Statically prerendered. |
| `src/app/(marketing)/features/all/page.tsx` | The lookup: the grouped matrix on its own page, with plan prices derived from `lib/plans` and a back link to `/features`. Statically prerendered. |
| Wiring | Header + footer "Features" repointed from `/#features` to `/features`; `sitemap.ts` entries (`/features` 0.9, `/features/all` 0.7); "See everything it does" link under the homepage bento. |

**Three deliberate deviations from the plan above:**

0. **The matrix lives on `/features/all`, not at the bottom of `/features`** _(owner's call, 2026-08-17)_. One page carrying eleven narrative sections **and** a hundred-plus table rows was too much scroll, and it buried the pricing and CTA behind the lookup. Split in two: `/features` is the read and ends with a band saying how many capabilities are on the other page, `/features/all` is the reference. This also resolves open question 2 below in the narrower direction: hub-and-spoke per feature area was considered and set aside as twelve pages to maintain for the same reader benefit. Matrix groups keep `id` anchors, so a future "full quoting list" deep link is already possible.

1. **No sticky anchor nav.** Two navigation bars on one page is redundant, and 11 anchors cannot fit the one-line desktop nav rule. Instead the hero's right column *is* the contents: a real 11-link panel, which doubles as the depth signal the page is trying to land. Sections carry `scroll-mt-24` so hash links park correctly.
2. **No image placeholder boxes.** Empty grey rectangles read worse than a page without them, and div-built fake screenshots are the exact tell the `/` audit flagged. The page ships as a strong typographic v1 with eight `TODO` comments marking the exact screenshot slots and their target sizes. Filling them is step 3.

**Verified:** typecheck clean, lint clean, 425 tests pass, `/features` prerenders static, all 13 anchors present, **zero em-dashes in rendered visible text**, and every plan cell resolves from capabilities (catalog items 5/Unlimited/Unlimited, AI quotes 20-a-month/Unlimited/Unlimited, embed and team Growing-only, follow-up agents Solo+, Compliance Watch on all three).

**Liveness confirmed working:** with `SIGNWELL_TEST_MODE=true` locally, all contract copy and the Contract Follow-up agent are absent from the rendered HTML; with `TWILIO_*` unset, all texting copy is absent. Turning those on in production is what publishes the copy.

## Build order

1. **Write `features.ts`** — the full inventory with plan keys and `live` flags. This is the real work; everything else is layout. Doing it first also produces the honest audit of what can be claimed.
2. **Ship the page with placeholders for imagery**, real copy, and the matrix. It is already useful and linkable at this stage.
3. **Capture the screenshot set** and drop them in. This is the step that decides whether the page looks credible.
4. **Wire nav/footer/sitemap + the homepage link.**
5. **Flip the `live` flags** as contracts and SMS come online; add testimonials when real ones exist.

## Open questions worth your call

1. **`/features` vs `/product` vs `/tour`** — I'd pick `/features` (matches the existing nav label and how operators search).
2. ~~**One page or a hub?**~~ **Settled 2026-08-17:** two pages, narrative and lookup (see deviation 0). Hub-and-spoke per feature area stays available if `/features` later outgrows a comfortable read.
3. **Publish before or after Stripe goes live?** Recommend after, or with signups still closed and the page pointing at early access. A features page this complete is a strong ask-for-the-sale; it deserves a funnel that can take the money.
