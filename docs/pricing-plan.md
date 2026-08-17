# Pricing & plan review — differentiation, acquisition, and revenue

_Reviewed 2026-08-17 against the live plan definitions (`src/lib/plans.ts`), the capability inventory behind `/features/all` (`src/lib/marketing/features.ts`), and the checkout/webhook code paths. This is a business review of the Free / Solo $29 / Growing $59 structure, with a path for implementation._

## ✅ Decisions (owner, 2026-08-17) — and Phase 1 SHIPPED same day

| Decision | Call |
|---|---|
| **Fee model** | Processing pass-through (2.9% + 30¢) on **every** plan + **2% platform surcharge on Free**, 0% on Solo/Growing |
| **Prices** | **$39 / $79** (from $29 / $59) |
| **E-sign contracts** | **Solo and up** |
| **Driver route access** | **Team seat only (Growing)** — the free shareable-link idea from the deliveries follow-ups is killed; a tokenized link may only ever ship Growing-gated |

**Phase 1 as built** (typecheck + lint clean, 434 tests green, all pages prerender):

- **`src/lib/fees.ts`** (+ 9 tests) — `applicationFeeCents()`: pass-through + plan surcharge, resolved through `effectivePlanId` (so a lapsed paid plan pays Free's rate and a comped account pays the paid rate), clamped to the charge, `PLATFORM_FEE_BPS` demoted to an emergency global override. Checkout (`/api/checkout`) now applies it to every connected charge — deposit, full, and balance alike.
- **Refunds fixed while in there** — a second instance of the same hole: `refunds.create` had no `reverse_transfer`, so a refund was paid from the **platform's** balance while the operator kept their transfer. Now the transfer is reversed (prorated on partials) whenever the charge has one; the application fee is deliberately kept (matches Stripe keeping its own fees on refunds).
- **`esignContracts` capability** — Free `false`, Solo/Growing `true`; enforced **fail-closed** inside `sendAgreementForOrder` (the single choke point, so the webhook and any future caller inherit it; an unresolvable operator now skips rather than sending an unattributable billable doc).
- **`platformFeeBps` capability** — Free 200, paid 0; the source for checkout, the pricing-page fee line, and the features matrix, so all three cannot disagree.
- **Prices** — `PLANS` at 3900/7900; `scripts/setup_billing.mjs` rewritten to **sync**: a changed amount creates a replacement price, transfers the `lookup_key`, archives the old (existing subscriptions keep their price), and renames products Bounce→Movables. ⚠️ **Owner action: re-run it** (`node --env-file=.env.local scripts/setup_billing.mjs`) against test mode now and live later — until then Stripe test prices still say $29/$59.
- **Copy** — pricing cards gain "0% platform fee on bookings" (Solo) and "Team members & driver logins" (Growing); a derived fee-disclosure line renders under the tiers on every page that shows them; the payments FAQ states the fees; the features matrix gained "Standard card processing" and a derived "Platform fee on bookings 2% / 0% / 0%" row, contract rows now carry the Solo+ gate, and Team gained the driver-seat row + highlight.

Remaining from the original path: Phase 2 (SMS gate at Twilio time, annual prices, item-cap meter) and Phase 3 (trial-for-all, direct-charges migration, price re-check) — unchanged below.

## The three questions, answered up front

| Question | Verdict |
|---|---|
| **Differentiated enough to motivate upgrades?** | **Partially.** Free → Solo has a real meter (20 AI quotes/mo) but leaks badly in this vertical, where a 4-item operator is a real business that never hits either cap. Solo → Growing is thin today (team + API + support), though a strong hidden lever exists (the driver seat) that isn't being marketed and is at risk of being given away. |
| **Compelling to get in the door?** | **Yes — arguably too compelling.** Free with no card includes the entire operating system: unlimited bookings, payments, CRM with leads, inbox, calendar, delivery routes, document library, Compliance Watch, promos, branding. Acquisition is not the problem. The problem is that Free is complete enough to live on forever, and it also cannibalizes the 14-day trial (people self-select into Free and never feel the paid product). |
| **Set up to generate revenue?** | **No — and it's worse than "no transaction revenue."** On the current rails the platform *loses money on every booking, on every plan.* See Finding 1. |

---

## Findings, ranked by severity

### F1 ⚠️ The platform pays Stripe's processing fee on every booking and collects nothing

Verified in code: checkout uses **destination charges** (`transfer_data.destination`, `src/lib/payments/stripe.ts:57`) with `PLATFORM_FEE_BPS` defaulting to **0** (`src/app/api/checkout/route.ts:12`). With destination charges, Stripe's processing fee (~2.9% + 30¢) is debited from the **platform's** balance; the full charge amount transfers to the operator. With the application fee at zero, that means:

> An operator doing $5,000/mo in bookings costs the platform roughly **$150/mo in Stripe fees** — against $0 (Free), $29 (Solo), or $59 (Growing) in revenue.

The roadmap already half-knows this ("consider direct charges if operators should bear Stripe processing fees"), but it's framed as a consideration, not as the unit-economics hole it is. **A single successful Free-plan operator is a money-losing customer with no ceiling.** The subscription can never outrun a percentage.

This is the one finding that must be resolved **before Stripe goes live** (Go-Live Checklist item 3). It is also the cheapest moment there will ever be to fix it: signups are closed, nobody is paying, and the only real operator is comped — there is no grandfathering problem this week. There will be one every week after launch.

### F2 ⚠️ Per-use hard costs are not plan-gated

Two features carry a direct marginal cost to the platform and are available to Free accounts:

- **E-sign contracts.** `autoSendEnabled()` is a pure env check (`src/lib/esign/agreements.ts`) with zero plan awareness, and the Stripe webhook sends an agreement on every paid booking. Once `SIGNWELL_TEST_MODE=false`, **every Free booking generates a billable, legally binding SignWell document** on the platform's account (25 free docs/mo, then per-doc). Free operators would burn the platform's document allowance first.
- **SMS**, when Twilio goes live: per-message and per-number costs, `smsEnabled()` is also env-only.

The one per-use cost that *is* handled well: AI quotes are capped at 20/mo on Free and enforced before any model call — Anthropic exposure is bounded by design. That's the pattern the other two should follow.

(Deliberately fine as-is: **Compliance Watch free on every plan.** It costs a nightly cron, it's the trust hook, and the Agents page already markets it that way. Don't touch it.)

### F3 Free → Solo: the meters miss the vertical's most common customer

The two Free limits are 5 catalog items and 20 AI quotes/mo. In party rentals, **a 3–6 unit fleet is a real, revenue-generating business** — a huge share of bounce-house operators own a handful of inflatables and a stack of tables. That operator:

- never hits the item cap (4 items),
- may never hit the quote cap (10–15 inquiries/mo),
- and gets unlimited bookings, payments, CRM, inbox, routes, and documents free, forever.

What Solo actually sells that operator is the follow-up agents — which are genuinely valuable (one recovered balance pays for two months) but are **off by default and invisible** until the onboarding checklist nudges them. The caps aren't wrong as *nudges*; they're wrong as the *only* monetization. Once F1 is fixed (Free pays a per-booking fee), the caps can stay generous and acquisition-friendly, because free riders become self-funding instead of subsidized.

### F4 Solo → Growing is a thin story, with one strong lever unprotected

Growing's exclusives today: team members, API/embed, priority support. API/embed is niche (operators with a developer). "Priority support" is undefined. That leaves **team** carrying the 2× price jump — and team has a killer concrete form that nothing in the product or marketing exploits:

> **The driver seat.** The daily route sheet (`/deliveries`) is behind operator login. Putting the route in a driver's hand requires a member account → team → **Growing**. "Your driver's phone" is the most tangible $59 justification in the product.

Two risks: (a) it's not marketed anywhere — the features page sells team as roles/permissions, not as "your driver gets the route"; (b) the roadmap lists a follow-up, *"driver access (shareable per-day link or a driver role)"* — **shipping a free shareable link would silently give away Growing's best lever.** That follow-up is a pricing decision wearing a UX costume; it should be decided here, not in a deliveries iteration.

Already queued and correctly Growing-gated when they ship: custom storefront domains, Meta channels. Those will substantially fix this tier's story — protect that gating.

### F5 The free plan cannibalizes the trial

Paid plans carry a 14-day trial, but the trial only exists for people who already chose to pay. The self-serve default path is: pick Free, never see unlimited quotes or the agents, never feel the downgrade pain that sells upgrades. The standard fix is to make the trial the *entry* experience — every new signup gets 14 days of Growing (no card), then lands on their chosen plan. Downgrade friction does the selling.

### F6 Price points are low for the category

Party-rental software (Inflatable Office, Event Rental Systems, Goodshuffle Pro, Rentman) commonly lands in the **~$50–$300/mo** range, often per-user or with transaction components (**verify current pricing before anchoring** — these move). $29/$59 positions Movables as the budget option while the feature surface argues for mid-market. Underpricing at launch is hard to unwind; pre-launch is the free moment to move. There is also no annual option, which is free-ish money (cash up front, lower churn) on rails that already exist (`lookup_key`s + `scripts/setup_billing.mjs`).

---

## Recommendations

### R1 — Make the platform fee real and plan-aware _(the structural fix; do before Stripe live)_

Adopt the industry-standard split that customers already accept from Squarespace/HoneyBook/Acuity:

1. **Processing pass-through on every plan:** the application fee always covers Stripe's cost (~290bps + 30¢/charge). Framed to operators as "payment processing 2.9% + 30¢" — universally understood, nobody reads it as a platform tax.
2. **A plan-level platform fee on top:** **Free ~2%, Solo 0%, Growing 0%.** This turns Free from a subsidy into a funnel that pays for itself, and creates the cleanest upgrade math in SaaS: *an operator doing ~$1,500/mo in bookings breaks even on Solo by upgrading.* The pricing page can say it in one line: "2% per booking on Free · 0% on paid plans."

**Mechanism:** add `platformFeeBps` to `PlanCapabilities` (`src/lib/plans.ts`); the checkout route already loads the operator (`getOperatorById`), so compute `applicationFeeAmount` from `planCapabilities(op)` + the processing pass-through instead of the flat env var (keep the env var as a global override/floor). Applies automatically to deposit, full, and balance charges since they share the checkout path. Add tests beside `plans.test.ts`.

**Option B (later, structural):** switch to **direct charges** so operators natively bear Stripe fees and own refunds/disputes, with `application_fee_amount` purely as platform margin. Cleaner long-term liability story, but a bigger change (charge ownership, refund path, receipt identity). Ship Option A now — it's a ~1-file change — and revisit B post-launch.

### R2 — Gate the per-use-cost features before their go-live flips

- **E-sign contracts → Solo+.** Add `esignContracts` to `PlanCapabilities`; check the operator's effective plan in the webhook's agreement send (the operator is already resolved for the counterparty identity). Free operators see "contracts are a Solo feature" — which is also a better upgrade trigger than the item cap, because it fires on every booking. Do this **before** `SIGNWELL_TEST_MODE=false` (Go-Live item 4).
- **SMS → Solo+ (or Growing) when Twilio lands.** Same pattern in `smsEnabled()`'s call sites / the inquiry composer toggle.
- **Leave Compliance Watch free** (deliberate, keep marketing it as such).

Bonus: the `/features/all` matrix and the features-page prose **derive from `PLAN_CAPABILITIES` and the `live` predicates**, so both gates propagate to the marketing site automatically. The two places that need hand edits: the `PLANS.*.features` string arrays (pricing cards) and the pricing FAQ.

### R3 — Give Growing a story worth 2×

1. **Market the driver seat.** Features page (Team + The Day sections) and pricing copy: "Put the route sheet in your driver's hand." It's the concrete face of "team members."
2. **Decide the driver-link question here:** the roadmap's "shareable per-day route link" follow-up should either be killed, or shipped as a **Growing** feature. Not as free UX.
3. **Keep custom domains and Meta channels Growing-gated** when they ship (already the plan — this doc just makes it a commitment).
4. **Define priority support or drop it** from the feature list; an undefined promise reads as filler.

### R4 — Trial architecture: everyone starts on Growing

New signups get a 14-day, no-card Growing trial, then land on Free (or their chosen paid plan). Mechanism: set `plan='growing', subscription_status='trialing'` at signup with a local expiry (a sweep or an `effectivePlanId` date check) rather than a Stripe object, since there's no card. Moderate effort — schedule it, don't block launch on it. A cheap interim: a one-click "try the agents free for 14 days" on the Agents page upsell.

### R5 — Price positioning and annual billing

- **Raise before launch, not after:** $39/$79 (conservative) or $49/$99 (category-aligned) — decide against a fresh competitor check. Nobody is paying today; this window closes at launch.
- **Add annual prices** (2 months free): new `solo_yearly`/`growing_yearly` lookup keys in `setup_billing.mjs`, a billing-interval param on `billing/checkout`, a toggle on the pricing cards.

### R6 — Small upgrade-surface polish

AI-quote usage already shows a meter with an upgrade CTA (good). Add the same at the item cap (inventory add-flow already blocks; show "4 of 5 items" *before* the wall) and a "recovered $X this month" stat on the agents once they're running — the agents are the feature that sells itself if it shows its work.

### What NOT to do

- **Don't gut Free's operating system** (CRM, inbox, calendar, routes, documents). It's the acquisition engine and the word-of-mouth story in a tight-knit vertical. R1 makes free riders self-funding; the caps' job is nudging, not walling.
- **Don't lower the item cap.** 5 is right once the fee model is fixed.
- **Don't paywall Compliance Watch.**

---

## Implementation path

| Phase | When | Work | Effort |
|---|---|---|---|
| **0 — Decide** | Now | Fee numbers (pass-through + Free bps), price points, driver-link ruling, e-sign tier. Pure decisions; this doc is the input. | — |
| **1 — Before Stripe live** _(pairs with Go-Live item 3)_ | Next | `platformFeeBps` in `PlanCapabilities` + checkout fee computation + tests; `esignContracts` gate in the webhook send path; pricing-page + `PLANS.features` + FAQ copy updates; features-page rows pick up the gates automatically. | Small (1–2 days) |
| **2 — At each go-live flip** | With items 4/7 | SMS plan gate when Twilio ships; annual prices + interval toggle; item-cap meter. | Small each |
| **3 — Post-launch** | Later | Growing-trial-for-all signup flow; direct-charges migration (Option B); per-seat pricing review if teams grow; price re-check with real conversion data. | Moderate |

## The one-paragraph version

The product is priced like the subscription is the business, but the rails make the platform the merchant: today it would pay ~3% on every booking it processes and charge nothing back, so growth on Free (or even Solo) loses money without bound. Fix that with a plan-aware application fee (processing pass-through everywhere + ~2% on Free) before Stripe goes live, gate the two per-document/per-message cost centers (contracts, SMS) to paid plans before their switches flip, and give Growing its real story (the driver's phone, then custom domains). Everything else — trial-first onboarding, annual billing, price raises — is optimization on top of a model that finally points the right way.
