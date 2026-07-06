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
- [ ] **Multi-tenancy** — session-scoped queries everywhere; RLS policies keyed to membership (defense-in-depth); per-operator storefront routing (`slug` → `/s/[slug]`, subdomain, or custom domain — `/book` is single-operator today); per-operator API keys for bring-your-own-frontend.
- [x] **Stripe Connect** — Express connected accounts; onboarding via `/api/connect/onboard` → hosted Account Link → `/connect/return` records `charges_enabled`; customer checkout uses **destination charges** (`transfer_data.destination`) to route funds to the operator (platform fee via `PLATFORM_FEE_BPS`, default 0 since the subscription is the revenue). "Set up payments" banner on the dashboard until connected. _Prereqs: enable Connect in the Stripe dashboard (one-time). Follow-ups: `account.updated` webhook for post-onboarding status changes; consider direct charges if operators should bear Stripe processing fees._
- [ ] **Transactional email** (Resend) — booking confirmation/receipt, balance reminders, operator "new inquiry/booking" alerts.
- [ ] **Go-live hardening** — live Stripe + webhook, live SignWell, **separate prod Supabase project** (prod shares dev + demo seed today), migrations via Supabase CLI/CI instead of hand-pasted SQL.
- [ ] **Durable rate limiting + Free-tier monthly inquiry cap** — move to Upstash/Vercel KV; persistent per-operator counter.
- [ ] **Legal/trust** — Terms of Service, Privacy Policy, cookie consent; ensure the rental agreement is legally sound.

## Tier 1 — Operator product completeness

- [x] **Inventory management UI** — `/inventory` lists the operator's catalog; add/edit/delete items (name, category, price, rate, quantity, description, visibility, power) via a drawer + server actions (operator-scoped). _Follow-up: item **photos** (Supabase Storage; icon placeholders today)._
- [ ] **Settings** (stub) — profile, business hours, **delivery zones + fees**, **sales tax**, deposit %, auto-quote cap, blackout dates, min lead time (global 48h constant today).
- [ ] **Booking management** — calendar is read-only; add open/edit/cancel, mark delivered/completed, and **refunds** (Stripe refund exists in code, not wired to UI).
- [ ] **Wire the Inquiries "Send reply"** — the inbox composer is a stub; operators can't respond/adjust a quote.
- [ ] **Balance collection** — deposits leave a "balance due on delivery" with no mechanism to collect it (second payment link or in-person capture).
- [ ] **SignWell contract → single signer (customer-only)** — the `basic-rental-agreement` template has two signer roles, so both the company (`SIGNWELL_SENDER_EMAIL`) and the customer get a signing email. Decision made: **customer-only signing**. Needs (1) template edit so "Document Sender" has no signature field, then (2) drop the company signer in `sendAgreementForOrder` (`src/lib/esign/agreements.ts`); optionally gate a countersigner behind an env flag.

## Tier 2 — Reliability & scale

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
3. **Operator onboarding wizard** + **inventory management UI** (self-serve).
4. **Transactional email** + **balance collection** + **delivery fees/tax**.
5. **Prod DB split, migration tooling, durable rate limit, legal pages** (go-live checklist).
6. **Overbooking hardening, tests/CI, monitoring.**
