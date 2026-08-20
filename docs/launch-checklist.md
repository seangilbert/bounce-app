# Movables — Launch Checklist

_Assembled 2026-08-17 from the go-live checklist ([ROADMAP.md](ROADMAP.md)), the pricing work ([pricing-plan.md](pricing-plan.md)), and the business-readiness review. Updated 2026-08-18: operating agreement drafted (64/18/18, partner cash $3,000 each); counsel engagement expanded to five documents + two exhibits._

_Original framing: Six tracks; A and B start today and run in parallel. The critical path to taking money is **A → B (entity + counsel) → C → D**. Everything in Tracks A–D is config or paperwork — there is no code between here and launch._

---

## Track A — Protect the live site _(today, ~15 minutes, no dependencies)_

| Done | Item | Effort | Notes |
|---|---|---|---|
| ☐ | **Supabase Pro** on the prod project (`urmqfxsajoboibjqhtmn`) | ~2 min | Free tier auto-pauses on inactivity and has **no backups** — the site is already live at movables.ai. Cheapest insurance available. |
| ☐ | **Sentry DSN** — create project, set `NEXT_PUBLIC_SENTRY_DSN` in Vercel Production | ~10 min | Code is deployed and dormant. Email failures are deliberately silent (enumeration resistance), so Sentry is the only place a broken send surfaces. Optional: `SENTRY_AUTH_TOKEN`/`ORG`/`PROJECT` for readable stack traces. |

## Track B — Business foundation _(start now — this track has the lead times)_

| Done | Item | Lead time | Notes |
|---|---|---|---|
| ☐ | **Partner sign-off on the operating agreement** — 64/18/18 adopted, $3,000 cash each (12-month budget, counsel costs excluded), Exhibit G comp policy; fill the Exhibit F blanks (partner names, legal name, pre-formation expense total, venue city, registered agent) | days | Draft ready: `~/Documents/movables-legal/operating-agreement-draft.docx` (kept outside the repo — inter-member material) + private artifact. Two prepared negotiation notes inside: founder-vesting (§ 2.2) and the $2k/$1k cash tranches (§ 3.1). |
| ☐ | **Form the legal entity** — Massachusetts LLC (Certificate of Organization, $500; annual report $500/yr) | days–weeks | **Step zero.** Gates `company.ts`, Stripe live verification, counsel, insurance, and the mailing address. You're about to be merchant of record adjacent to an injury-prone industry. |
| ☐ | **Insurance** — general liability + E&O/cyber quotes | 1–2 weeks | Platform under bounce-house bookings, holder of customer PII. |
| ☐ | **Trademark screen** on "Movables" | days | Cheap search now beats a rebrand after traction. Low urgency, high regret-avoidance. |
| ☐ | **Fill `src/lib/legal/company.ts`** — 5 values: entity name, governing law, contact email, mailing address, effective date | 10 min (after entity) | Single source of truth; `/terms` and `/privacy` update everywhere from it. Address should be a registered agent / virtual office, not home. |
| ☐ | **One counsel engagement, five documents + two exhibits**: ① Operating Agreement review (in the counsel bundle — flagged inline for them: § 24L member non-compete, consent-or-buy deadlock clause, § 704(b) riders) plus drafting Exhibit C (IP Assignment) and Exhibit D (Spousal Consent), ② Terms of Service + DPA (you're processor for renter data), ③ Privacy Policy, ④ rental agreement text + whether it should recite booking specifics (items/dates/total), ⑤ follow-up-email compliance (is Quote Follow-up commercial? address + opt-out requirements) | 1–3 weeks | Bundle it — one engagement, not five conversations. Brief them on the six merge fields (`company_*`, policies) so the contract text is written to use them. |
| ☑ | **Assemble the counsel bundle** — done 2026-08-18: `~/Documents/movables-legal/counsel-bundle/` — kept outside the repo (cover memo, operating-agreement .docx, product overview, money-flow summary, merge-field spec, marketing-claims inventory, company facts sheet, current rental-agreement template .pdf/.docx) | done | One folder to attach the day a lawyer is picked. TBDs inside auto-resolve with the Exhibit F blanks. |
| ☐ | **Code follow-ups once company.ts is filled** _(Claude, ~1 hr)_: mailing address rendered in email footers from `LEGAL`; opt-out line on the Quote Follow-up nudge | after ↑ | Small, already scoped. |
| ☐ | **Define "priority support"** (e.g. 1-business-day response) or drop the bullet from Growing | 10 min | It's advertised on the pricing page; nothing defines it. |

## Track C — Money _(after entity; ~1 hour of config)_

| Done | Item | Notes |
|---|---|---|
| ☐ | **Stripe live keys** — `STRIPE_SECRET_KEY=sk_live_…` + `STRIPE_WEBHOOK_SECRET` from a new live webhook endpoint → `https://app.movables.ai/api/webhooks/stripe` | Subscribe to `checkout.session.completed` + the 5 subscription events. |
| ☐ | **Enable Connect in live mode** | Test connected accounts don't carry over — operators re-onboard. |
| ☐ | **Run `setup_billing.mjs` against the live account** | Creates all four prices (monthly $39/$79 + yearly $390/$790). Test mode already synced ✅. |
| ☐ | **Verify end-to-end**: one real charge (check the application fee landed), one refund (check the transfer reversed), one subscription signup | The fee model and refund reversal shipped this week — this is their first live exercise. |

## Track D — Launch flip _(when C is done and Terms are published)_

| Done | Item | Notes |
|---|---|---|
| ☐ | **`NEXT_PUBLIC_SIGNUPS_OPEN=true`** in Vercel Production + redeploy | The master switch: every marketing CTA flips from the early-access mailto to real signup at $39/$79. |
| ☐ | **Smoke the funnel**: pricing page → signup (monthly + annual toggle) → trial checkout → dashboard | First real pass through the new prices and interval param. |

## Track E — Contracts _(optional at launch; needs counsel output from Track B)_

| Done | Item | Notes |
|---|---|---|
| ☐ | **One template-editing session** on template `349452c7…` — edited **in place** (Free tier allows 1 template; delete+recreate changes the ID): counsel text + the six merge fields (`company_name/email/phone/address`, `cancellation_policy`, `damage_policy`) + remove the Document Sender signature field (single-signer) | All three edits in one sitting, so the counsel text is written around the fields. |
| ☐ | Point **prod** `SIGNWELL_TEMPLATE_ID` at `349452c7…` | Dev already is. |
| ☐ | Flip `SIGNWELL_AUTO_SEND=true`, `SIGNWELL_TEST_MODE=false`, `SIGNWELL_SINGLE_SIGNER=true`, `SIGNWELL_TEMPLATE_FIELDS=true` | Fields in the template **first**, then the flag — the create call fails otherwise. Live docs are billable + legally binding; the Solo+ gate keeps the cost off Free accounts. |
| ☐ | Confirm the live webhook (`SIGNWELL_WEBHOOK_ID`) targets `app.movables.ai` | The one untested hop; validates on the first real booking. |
| ☐ | _When custom contracts become an operator ask:_ **SignWell Business tier (~$36/mo)** — lifts the 1-template limit (`can_create_template: false` is the in-app editor's 401), makes white-glove templates trivial. **Not** the $275/mo API plan. | Month-to-month; upgrade → click "Use as rental agreement" → know in 5 minutes. |

## Track F — Deferred, deliberately

| Item | Trigger to act |
|---|---|
| **SMS** — Twilio number + A2P 10DLC registration | When you want the texting channel. Days-long carrier approval, so start ahead of need. The Solo+ gate already shipped dormant — flipping Twilio on can never bill Free accounts. |
| **`notifications@` Workspace alias** (or reply-to) | Before launch ideally — customer replies to receipts currently bounce. 5 minutes. |
| **SaaS sales tax** (Stripe Tax) | When subscription volume justifies it. |
| **`/features` screenshots** — 8 TODO-marked slots | When you have real product shots; the page ships typographic until then. |
| **Custom storefront domains** (lean v1, ~2–3 days build) | Post-launch Growing anchor, alongside the driver seat. Scoped in the roadmap. |
| **Pricing Phase 3** — trial-for-all signups, direct-charges migration, price re-check | Post-launch, with real conversion data. |

## Already handled — no action needed

- **Operator 1099-Ks** — Stripe Express connected accounts mean Stripe handles operator tax forms.
- **Money transmission** — destination charges keep you inside Stripe's licensed-platform model.
- **Renter marketing consent** — decided: consent runs to the operator, never the platform (roadmap, customer self-service item).
- **Per-transaction economics** — plan-aware platform fee, refund transfer-reversal, e-sign + SMS plan gates: all shipped and tested 2026-08-17.
- **Signer identity** — customers sign the rental agreement under their name, not their email (fixed 2026-08-17).
