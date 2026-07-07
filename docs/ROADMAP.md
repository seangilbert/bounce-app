# Bounce — Production MVP Roadmap

Path from the current working demo to a production-ready, **multi-tenant** SaaS that can take real customers and pay real operators.

_Last updated: 2026-07-05._

## Where we are

The core product loop works end-to-end and is deployed (https://bounce-app.vercel.app):
conversational AI quote → deposit/full checkout (Stripe) → e-signed booking (SignWell)
→ operator dashboard / calendar / inbox, all on live data.

**Solid today**
- Booking + availability engine (date ranges, peak-reservation math, oversell detection, abandoned-checkout expiry).
- Stripe Checkout with idempotent webhooks; SignWell agreements auto-sent.
- Conversational AI quote agent grounded in live inventory + DB prices.
- Operator app + storefront, wired to real data, responsive, deployed.

**Known gaps (verified in code)**
- **No authentication** — middleware only refreshes Supabase cookies; operator app is open to anyone. `getDefaultOperator()` (16 call sites) hardcodes one operator.
- **Single Stripe account, no Connect** — all payments land in one account.
- **No transactional email** — no receipts/confirmations/operator alerts.
- **In-memory rate limiting** — per-instance, ineffective across serverless.
- **No automated tests / CI; hand-applied migrations; shared dev↔prod DB.**

---

## Tier 0 — Production blockers

- [x] **Auth + operator accounts + plan billing** — Supabase Auth login + self-serve sign-up (creates an isolated tenant); `operator_members` mapping; middleware gates operator routes; `getSessionOperator()` in the operator app. Plan selection (Free / Solo $29 / Growing $59) with **Stripe subscription billing + 14-day trial**. _Follow-ups: **billing webhook** (renewal/failure/cancellation sync — return-page confirms the happy path today), email verification (needs Resend), plan feature-gating/limits, Stripe Customer Portal for self-service management._
- [~] **Multi-tenancy** — ✅ session-scoped operator resolution; ✅ **per-operator storefront routing** (`slug` → `/s/[slug]`, scoped catalog/quote/booking/payouts, verified isolated; `/book` redirects to the default operator). _Remaining: RLS policies keyed to membership (defense-in-depth); subdomains / custom domains; per-operator API keys for bring-your-own-frontend._
- [x] **Stripe Connect** — Express connected accounts; onboarding via `/api/connect/onboard` → hosted Account Link → `/connect/return` records `charges_enabled`; customer checkout uses **destination charges** (`transfer_data.destination`) to route funds to the operator (platform fee via `PLATFORM_FEE_BPS`, default 0 since the subscription is the revenue). "Set up payments" banner on the dashboard until connected. _Prereqs: enable Connect in the Stripe dashboard (one-time). Follow-ups: `account.updated` webhook for post-onboarding status changes; consider direct charges if operators should bear Stripe processing fees._
- [x] **Transactional email** (Resend) — `src/lib/email/` (REST, no SDK; best-effort, skips cleanly if `RESEND_API_KEY` unset). Wired: booking confirmation/receipt to the customer + "new booking" alert to the operator (paid webhook); operator "new inquiry" alert (needs-review); inquiry **reply delivered to the customer** (completes the inbox Send-reply). _Setup: add `RESEND_API_KEY` (+ `RESEND_FROM` with a verified domain — default `onboarding@resend.dev` only delivers to the Resend account owner). Follow-ups: balance reminders; email-verification gating on signup._
- [ ] **Go-live hardening** — live Stripe + webhook, live SignWell keys, and a **separate prod Supabase project**. _**DB split** — confirmed shared today: local dev **and** production both point at project `vjgurdppmwxdlhczswdb`, so dev experiments + hand-pasted migrations run against the same rows the live storefronts serve, and the demo tenants (`demo-1`/`demo-2`) live in prod. Split steps: (1) create a new prod Supabase project; (2) consolidate the hand-applied migrations (`0003`–`0016`) into a clean ordered set + adopt the Supabase CLI so they apply reproducibly instead of pasted SQL; (3) point Vercel production env (`SUPABASE_URL` / anon / service-role) at the new project, keep `.env.local` on the dev project; (4) decide prod starting data (clean slate vs a curated seed — not the demo tenants)._
- [ ] **Durable rate limiting + Free-tier monthly inquiry cap** — move to Upstash/Vercel KV; persistent per-operator counter.
- [ ] **Legal/trust** — Terms of Service, Privacy Policy, cookie consent; ensure the rental agreement is legally sound.

## Tier 1 — Operator product completeness

- [x] **Inventory management UI** — `/inventory` lists the operator's catalog; add/edit/delete items (name, category, price, rate, quantity, description, visibility, power) via a drawer + server actions (operator-scoped). (Item photos: separate item below.)
- [ ] **Inventory item photos (image upload)** — let operators upload photos of each rental item; today the storefront + inventory show category icon placeholders (`.bg-hatch`). Scope: a Supabase **Storage** bucket (per-operator path, public read), an image upload/drop control in the inventory item drawer (multiple images, choose a primary, remove), client-side resize/thumbnail, store URLs in the existing `items.images` column, and render them on the storefront item cards + operator inventory list (falling back to the icon when none). Consider basic validation (type/size) and cleanup of orphaned files on item delete.
- [~] **Settings** — `/settings` (was stub): editable **business profile** (name, owner, phone, geocoded service area), **booking policies** now operator-configurable (deposit %, auto-quote cap, min lead time — wired into checkout, storefront, and the AI escalation gate), and a **storefront/account** panel (storefront URL, plan/subscription, Connect status + connect). Also hardened `/api/items` to expose only public operator fields. _Remaining: business hours, blackout dates, delivery **zones** (by ZIP/distance — flat delivery fee is done)._
- [x] **Booking management** — `/bookings/[id]` detail page (operator-scoped) with actions: mark delivered / completed, cancel (frees inventory), and **refund** (Stripe refund → order refunded + booking canceled). Wired from the calendar's "Open booking". _Follow-up: edit a booking's items/dates; operator-created "New booking"._
- [ ] **Driver daily route interface (deliveries)** — `/deliveries` is a `ComingSoon` stub today; scaffolding already exists (a `Stop` mock model — `DELIVER` / `PICK UP`, time, item, customer, address, status — and bookings carry `delivery_window` / `delivery_address` / `delivery_zip`). Build a **mobile-first daily route** for the drivers/workers who drop off and pick up equipment: the selected day's stops derived from committed bookings — **drop-offs** (on `start_date`) and **pick-ups** (on `end_date`) — each showing the time window, item(s), customer, and address, with one-tap **open in Maps** and **call/text customer**. Ordered by time window. Per-stop **Mark delivered / Picked up** advances the booking status (reuses the existing mark-delivered/completed actions → `delivered` on drop, `completed` on pickup) and flows back into the calendar + dashboard. Scope notes: a date switcher (today / tomorrow); **driver access** — decide between a lightweight driver role/login vs a shareable per-day route link (drivers usually aren't full operators, so gating matters); proof-of-delivery (photo/signature) and per-stop notes. _Follow-ups: geographic **route optimization**, a map view, and multi-driver assignment._
- [x] **Wire the Inquiries inbox actions** — "Send reply" records the operator's (edited) reply + marks the inquiry `replied` (clears it from "needs you"); "Dismiss" → `dismissed` (hidden). Operator-scoped server actions; dashboard/badge counts update. Customer delivery via email (Resend) is wired. _Follow-up: persistent conversation, see next item._
- [ ] **Inquiries → persistent conversation thread** — today the inbox is one-shot: the reply composer only renders while there's an unsent AI draft, and once you **Send reply** the inquiry flips to `replied` and the composer disappears (auto-answered/replied inquiries are read-only). The data model stores the customer's conversation plus a single `operator_reply` string — no thread, no follow-ups. **Phase 1 (outbound):** always-available composer on every inquiry regardless of status; render the full chronological thread (customer messages + every operator message); replace the single `operator_reply` field with a messages thread (migration — e.g. an `inquiry_messages` table); each send is stored and emailed (Resend). Kills the dead-end. **Phase 2 (two-way):** capture inbound customer replies back into the thread via a Resend inbound-email webhook and/or Twilio SMS — needs a reply-to address/phone number and is the bigger lift.
- [x] **Balance collection** — booking detail shows the balance due with **Collect balance** (Stripe checkout for total − deposit; webhook marks it paid-in-full without re-confirming/re-sending) and **Mark paid (cash)**. Charges only the remaining amount; doesn't reset the committed booking.
- [ ] **SignWell contract → single signer (customer-only)** — the `basic-rental-agreement` template has two signer roles, so both the company (`SIGNWELL_SENDER_EMAIL`) and the customer get a signing email. Decision made: **customer-only signing**. Needs (1) template edit so "Document Sender" has no signature field, then (2) drop the company signer in `sendAgreementForOrder` (`src/lib/esign/agreements.ts`); optionally gate a countersigner behind an env flag.

## Tier 2 — Reliability & scale

- [ ] **Performance (infra) follow-ups** — _(app-level nav perf already done: cached session/operator resolution, parallelized queries, loading skeletons.)_ Remaining: (a) **co-locate Supabase + Vercel in the same region** — each DB query is ~130ms; cross-region latency adds up. (b) **local JWT verification** (`getClaims` w/ asymmetric keys) to drop the ~300ms `auth.getUser()` round-trip the middleware makes on every request.
- [ ] **Overbooking race hardening** — availability check → booking creation isn't atomic; two simultaneous checkouts for the last unit can both pass (oversell guard only logs after the fact). Needs a transaction/lock or DB exclusion constraint.
- [ ] **Error monitoring** (Sentry) + structured logging.
- [ ] **Automated tests** — none exist; prioritize the availability engine, quote/escalation logic, webhook handlers. Add CI (typecheck/build/test gates) + a staging environment.
- [ ] **Accessibility pass** + mobile QA.

## Tier 3 — Nice-to-have

- [ ] Customer accounts / repeat booking, reviews & ratings, analytics dashboard, SMS notifications, promo codes, multi-item packages.

---

## Recommended sequence

1. **Auth + session-scoped operator resolution** (keystone; schema is already tenant-ready). **← now**
2. **Stripe Connect** (onboarding needs it).
3. ~~**Operator onboarding wizard** + **inventory management UI**~~ ✅ (`/onboarding` checklist: geocoded location → add rentals → connect Stripe; new signups land here).
4. **Transactional email** + **balance collection** + **delivery fees/tax**.
5. **Prod DB split, migration tooling, durable rate limit, legal pages** (go-live checklist).
6. **Overbooking hardening, tests/CI, monitoring.**
