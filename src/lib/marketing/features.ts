import { PLAN_CAPABILITIES, type PlanId } from "@/lib/plans";
import { smsEnabled } from "@/lib/sms";

/**
 * The product inventory behind the `/features` sales page — one module driving
 * both the narrative sections and the exhaustive capability matrix.
 *
 * Three rules make this file the thing that keeps the sales page honest:
 *
 * 1. **Plan columns are derived, never typed.** A row names the entitlement it
 *    depends on (`gate`) or the limit it renders (`quota`), and the matrix reads
 *    the answer out of `PLAN_CAPABILITIES`. So the page cannot advertise a
 *    feature on a plan that doesn't grant it — the same reason the pricing page
 *    is generated from `lib/plans` rather than copy-pasted.
 * 2. **Nothing dark is claimed.** A row or highlight with a `live` predicate is
 *    dropped from the page entirely while that capability is switched off in
 *    production (contracts in SignWell test mode, SMS without a registered
 *    number). Turning the feature on is what publishes the copy — there is no
 *    second place to remember to edit.
 * 3. **Only shipped behavior appears here.** Packages/bundles, Meta channels,
 *    custom storefront domains, and booking edits are deliberately absent.
 *
 * Liveness reads server-only env vars. These pages are statically prerendered,
 * so the values are baked at build time and a flip takes effect on the next
 * deploy — the same deal as `NEXT_PUBLIC_SIGNUPS_OPEN`.
 */

/** Boolean entitlements a row can be gated on (keys of `PlanCapabilities`). */
export type GateKey = "teamMembers" | "apiAccess" | "followUpAgents" | "esignContracts";

/** Numeric limits a row can render per-plan (keys of `PlanCapabilities`). */
export type QuotaKey = "maxItems" | "aiQuotesPerMonth" | "platformFeeBps";

/**
 * True when a paid order actually sends a **binding** rental agreement in
 * production.
 *
 * Deliberately stricter than `autoSendEnabled()` in `lib/esign/agreements.ts`:
 * that one governs whether we call SignWell at all, while this one also demands
 * we've left test mode, because a test-mode document is free, unbranded, and
 * **not legally binding** — not something to sell. Replicated here rather than
 * imported so a static marketing page never pulls in the booking data layer.
 */
function contractsLive(): boolean {
  return (
    process.env.SIGNWELL_AUTO_SEND === "true" &&
    process.env.SIGNWELL_TEST_MODE === "false" &&
    !!process.env.SIGNWELL_TEMPLATE_ID
  );
}

/** True when texting works end to end (Twilio credentials present). */
function textingLive(): boolean {
  return smsEnabled();
}

/** One row of the capability matrix. */
export interface Capability {
  label: string;
  /** Optional second line, for a row that needs a clarifying detail. */
  detail?: string;
  /** Entitlement this row depends on. Omitted = included on every plan. */
  gate?: GateKey;
  /** Render the per-plan number from `PLAN_CAPABILITIES` instead of a check. */
  quota?: QuotaKey;
  /**
   * Escape hatch for a plan difference that is **not** a code-enforced
   * capability (support levels, for instance). Prefer `gate` wherever a real
   * entitlement flag exists.
   */
  plans?: PlanId[];
  /** Predicate for a feature that is built but can be switched off in prod. */
  live?: () => boolean;
}

/** A prose proof point rendered in a section body (not the matrix). */
export interface Highlight {
  title: string;
  body: string;
  live?: () => boolean;
}

export interface FeatureGroup {
  /** Anchor id, shared by the section and the matrix group. */
  id: string;
  /** Short label for the in-page nav. */
  nav: string;
  /** Section headline. */
  headline: string;
  /** Section standfirst. Keep to 20 words or fewer. */
  body: string;
  highlights: Highlight[];
  capabilities: Capability[];
}

export const FEATURE_GROUPS: FeatureGroup[] = [
  {
    id: "quoting",
    nav: "Quoting",
    headline: "An assistant that quotes like your best employee",
    body: "Customers ask in plain language and get a real, bookable quote priced from your own catalog.",
    highlights: [
      {
        title: "Your prices, not a guess",
        body: "Every quote is calculated from your live catalog, your rates, your tax setup, and your delivery pricing. The assistant explains the number; the system computes it, so it can never invent a price you don't charge.",
      },
      {
        title: "It knows your actual constraints",
        body: "Your service area, operating days, delivery windows, blackout dates, minimum lead time, deposit terms, and active promos are assembled from your settings on every conversation. So it won't promise a closed Sunday, a blacked-out weekend, a same-day booking inside your lead time, or delivery two towns outside your radius.",
      },
      {
        title: "Brief it in your own words",
        body: "Tell it how you talk, your house rules, and the safety points that matter for your equipment. The conduct that matters everywhere is built in: safety before the sale, no invented discounts, escalate rather than guess, and take no for an answer.",
      },
      {
        title: "It knows when to get you",
        body: "Past your auto-quote limit or off the map, it stops quoting, captures the lead, alerts you, and tells the customer a human is picking it up. Never a dead end, never a wrong number.",
      },
      {
        title: "A quote you can book",
        body: "The quote is a live, bookable card, so an answered question turns into a paid reservation without a callback.",
      },
    ],
    capabilities: [
      { label: "AI quote assistant", quota: "aiQuotesPerMonth", detail: "Conversations answered with a priced, bookable quote" },
      { label: "Catalog items", quota: "maxItems" },
      { label: "Quotes priced from your live catalog and rates" },
      { label: "Sales tax, delivery, and deposit calculated in the quote" },
      { label: "Respects your service area, hours, blackout dates, and lead time" },
      { label: "Applies your active promotions automatically" },
      { label: "Brief the assistant in your own words" },
      { label: "Escalates to you instead of guessing" },
      { label: "Captures the lead even when it can't quote" },
      { label: "Quote converts straight to checkout" },
    ],
  },
  {
    id: "inbox",
    nav: "Inbox",
    headline: "Every request, in one inbox, answered first",
    body: "Web chat and email land in one thread. The AI replies immediately. You step in whenever you want.",
    highlights: [
      {
        title: "Nobody waits",
        body: "The assistant answers the moment a request arrives, at 11pm on a Saturday or while you're carrying a slide across a lawn. Customers book whoever replies first, and now that's you.",
      },
      {
        title: "One thread per customer",
        body: "Web chat and email replies thread into the same conversation with full history, so a returning question doesn't start from nothing.",
      },
      {
        title: "Texting too",
        body: "Customers text your number and the same assistant answers, with the whole exchange in the same inbox.",
        live: textingLive,
      },
      {
        title: "Hand off in both directions",
        body: "Take over a thread and the AI steps back. Hand it back and it picks up where you left off. While you're driving the conversation it stays on as a copilot and drafts the next reply for you to send or edit.",
      },
      {
        title: "Live, and labelled",
        body: "Messages stream in without a refresh, each tagged with the channel it came from, and one person who both texts and emails is recognized as one person.",
      },
      {
        title: "Did it convert?",
        body: "Every inquiry carries its outcome, whether it booked, started a checkout, or went nowhere yet, with the amount and a link to the booking. Even the threads the AI handled without you are measurable.",
      },
    ],
    capabilities: [
      { label: "Shared inbox for every conversation" },
      { label: "Storefront web chat" },
      { label: "Email replies threaded into the conversation" },
      { label: "Two-way text messaging", live: textingLive },
      { label: "AI answers first, day or night" },
      { label: "Take over a thread (the AI stands down)" },
      { label: "Hand the thread back to the AI" },
      { label: "AI drafts replies while you handle a thread" },
      { label: "Live updates with no refresh" },
      { label: "Channel labels on every message" },
      { label: "One customer recognized across channels" },
      { label: "Booking outcome shown on every inquiry" },
      { label: "Filter to the threads that need you" },
      { label: "New-inquiry email alerts" },
    ],
  },
  {
    id: "storefront",
    nav: "Storefront",
    headline: "A booking page your customers actually finish",
    body: "Your catalog, your branding, live availability, and checkout, on a link you can share anywhere.",
    highlights: [
      {
        title: "Branded to you",
        body: "Your logo, your color, your tagline, your about text. Customers see your business, and the assistant answers as your business.",
      },
      {
        title: "Availability they can trust",
        body: "Shoppers pick their dates and see what is genuinely bookable for that weekend, item by item, with photos, dimensions, and power requirements on every detail page.",
      },
      {
        title: "No account required",
        body: "Browse, get a quote, and check out as a guest. Signing in is optional and only buys extras: a saved list across every storefront and the ability to pick up an earlier conversation.",
      },
      {
        title: "Their own bookings, self-serve",
        body: "Customers get a passwordless portal showing their bookings across every operator they've rented from, what they've paid, what's still owed with a link to pay it, and the status of their agreement. That's a portion of your phone calls, gone.",
      },
      {
        title: "Or keep your own website",
        body: "Paste one line of script and the whole storefront, chat included, drops into the site you already have, locked to your domains. There's a public API if your developer would rather build the front end.",
      },
    ],
    capabilities: [
      { label: "Branded storefront page" },
      { label: "Your logo, accent color, tagline, and about text" },
      { label: "Multiple photos per item with a full-screen carousel" },
      { label: "Item detail pages with size, power, and description" },
      { label: "Date-aware live availability" },
      { label: "Cart and checkout" },
      { label: "Guest checkout, no customer account needed" },
      { label: "Saved items across every storefront" },
      { label: "Resume an earlier conversation" },
      { label: "Customer portal for bookings, payments, and contract status" },
      { label: "Embed the storefront on your own website", gate: "apiAccess" },
      { label: "Public API (catalog + quoting)", gate: "apiAccess" },
      { label: "Domain-locked keys for the embed", gate: "apiAccess" },
    ],
  },
  {
    id: "bookings",
    nav: "Bookings",
    headline: "You will not double-book your last bounce house",
    body: "Availability is real math on real stock, and the reservation itself is settled by the database.",
    highlights: [
      {
        title: "Peak overlap, not a day count",
        body: "Availability is computed across the whole rental window, so multi-day rentals, back-to-back weekends, and partial overlaps all resolve correctly instead of approximately.",
      },
      {
        title: "The last unit can only be sold once",
        body: "Two customers checking out for the same last unit at the same instant are serialized in the database. One gets the booking; the other is told immediately that it just sold out. Not usually fine, but enforced.",
      },
      {
        title: "Dead carts let go",
        body: "An abandoned checkout releases its hold automatically, so a customer who wandered off mid-payment doesn't quietly eat your Saturday.",
      },
      {
        title: "Stock that means something",
        body: "Available counts what you own minus what's already out, damaged, in repair, or waiting to be cleaned. So \"available\" means you can actually put it on a truck.",
      },
      {
        title: "Phone and walk-in orders too",
        body: "Build a quote yourself in a few taps, then either email a pay link or record it as booked for cash. Same calendar, same inventory, same math.",
      },
    ],
    capabilities: [
      { label: "Peak-overlap availability across the full rental range" },
      { label: "Oversell-proof reservations settled in the database" },
      { label: "Abandoned checkouts release their inventory" },
      { label: "One calendar for every booking" },
      { label: "Booking detail with delivered / completed / cancel" },
      { label: "Cancelling frees the inventory immediately" },
      { label: "Operator-built quotes and phone bookings" },
      { label: "Email a customer a secure pay link" },
      { label: "Record a cash or over-the-phone booking" },
      { label: "Condition-aware stock (cleaning, damaged, in repair)" },
      { label: "Required-equipment checklist per item" },
      { label: "Footprint and power requirements per item" },
      { label: "60-day availability view per item, with who's holding it" },
    ],
  },
  {
    id: "payments",
    nav: "Payments",
    headline: "Get paid before the truck leaves",
    body: "Deposits at checkout, the balance on delivery, and payouts straight to your own bank.",
    highlights: [
      {
        title: "Your money, your account",
        body: "Payments run through Stripe directly into your bank account. We never hold your funds and never see a card number.",
      },
      {
        title: "Deposit now, balance later",
        body: "Take a deposit at your percentage or the full amount up front, then collect the rest in a tap by card, or mark it paid in cash. Cash is recorded as a real transaction, so your totals are true rather than nearly true.",
      },
      {
        title: "Priced the way you price",
        body: "Sales tax split between rental and delivery, delivery charged flat, by zone, or by distance from a geocoded address, and refunds handled from the booking.",
      },
      {
        title: "Discounts that run themselves",
        body: "Codes with expiry dates, minimums, and usage caps, plus automatic promotions for slow weekdays and repeat customers. Only the best single discount applies, so nothing stacks by accident.",
      },
      {
        title: "The agreement signs itself",
        body: "The rental agreement goes out for e-signature the moment a booking is paid, named to your business as the counterparty, with your cancellation and damage policies inside it.",
        live: contractsLive,
      },
    ],
    capabilities: [
      { label: "Card checkout, deposit or full payment" },
      { label: "Payouts direct to your bank via Stripe" },
      { label: "Standard card processing", detail: "2.9% + 30¢ per charge, every plan" },
      { label: "Platform fee on bookings", quota: "platformFeeBps" },
      { label: "Collect the remaining balance later" },
      { label: "Record cash payments as real transactions" },
      { label: "Refunds from the booking" },
      { label: "Sales tax split between rental and delivery" },
      { label: "Delivery priced flat, by zone, or by distance" },
      { label: "Discount codes with limits and expiry" },
      { label: "Automatic weekday and repeat-customer promotions" },
      { label: "Cancellation and damage policies shown before payment" },
      { label: "Policies repeated in the quote and confirmation emails" },
      { label: "E-signed rental agreement on payment", gate: "esignContracts", live: contractsLive },
      { label: "Your business as the named counterparty", gate: "esignContracts", live: contractsLive },
      { label: "Your policies carried into the agreement", gate: "esignContracts", live: contractsLive },
    ],
  },
  {
    id: "operations",
    nav: "The day",
    headline: "The day's route, in your driver's hand",
    body: "Drop-offs and pick-ups in delivery-window order, on a phone, with one tap to everything.",
    highlights: [
      {
        title: "One screen per day",
        body: "Every drop-off and pick-up in window order, each with the customer, the items, and the address. One tap opens maps, one tap calls or texts, one tap marks it delivered or picked up.",
      },
      {
        title: "Marking a stop moves the business",
        body: "Delivered on the route sheet is delivered on the booking, the calendar, and the dashboard. Nobody re-enters anything at the end of the day.",
      },
      {
        title: "Tomorrow, before you leave",
        body: "Flip to the next day to see what needs loading tonight.",
      },
      {
        title: "Today, at a glance",
        body: "A dashboard with the day's jobs, the month's revenue, discounts given, and anything that needs you, computed in your own timezone so today means today.",
      },
    ],
    capabilities: [
      { label: "Mobile daily route sheet" },
      { label: "Drop-offs and pick-ups in delivery-window order" },
      { label: "One-tap maps, call, and text per stop" },
      { label: "Mark delivered or picked up from the route" },
      { label: "Switch to any day's route" },
      { label: "Dashboard with today's jobs and month revenue" },
      { label: "Your timezone throughout" },
      { label: "Booking confirmations and receipts emailed automatically" },
      { label: "New booking and new inquiry alerts to you" },
    ],
  },
  {
    id: "agents",
    nav: "Agents",
    headline: "A team that chases money and paperwork overnight",
    body: "Each agent has one job, runs nightly, shows its work, and switches off whenever you say.",
    highlights: [
      {
        title: "Payment Follow-up",
        body: "Emails customers with an unpaid balance a few days before their event, with a secure pay link. The most direct revenue recovery in the product.",
      },
      {
        title: "Quote Follow-up",
        body: "Checks in on quotes you sent that haven't booked after three days, with the link to reserve. Warm, never pushy.",
      },
      {
        title: "Contract Follow-up",
        body: "Nudges customers who haven't signed their rental agreement after 48 hours, and re-sends the signing email.",
        live: contractsLive,
      },
      {
        title: "Compliance Watch",
        body: "Warns you two weeks before your insurance, licenses, permits, or inspection records expire. Free on every plan, because a lapsed certificate isn't a billing question.",
      },
      {
        title: "In your voice, on your terms",
        body: "The agents speak the way you briefed the assistant, they're all off until you switch them on, and each one emails a given customer once ever. No loops, no nagging, and an activity log so you can see exactly what went out.",
      },
    ],
    capabilities: [
      { label: "Payment Follow-up: unpaid balance reminders", gate: "followUpAgents" },
      { label: "Quote Follow-up: nudge quotes that haven't booked", gate: "followUpAgents" },
      { label: "Contract Follow-up: chase unsigned agreements", gate: "followUpAgents", live: contractsLive },
      { label: "Compliance Watch: document expiry warnings", detail: "Free on every plan" },
      { label: "Agents write in your business's voice" },
      { label: "Off by default, one switch each" },
      { label: "Each customer emailed once, ever" },
      { label: "Activity log per agent" },
    ],
  },
  {
    id: "customers",
    nav: "Customers",
    headline: "Every customer, every conversation, every dollar",
    body: "The customer list you'd have built yourself, assembled from the work you're already doing.",
    highlights: [
      {
        title: "One record per person",
        body: "Bookings, chats, texts, and storefront signups collapse into a single customer, deduplicated by email and phone, no matter how they first turned up.",
      },
      {
        title: "What they've actually paid",
        body: "Collected net of refunds, total booked, how many times, and what's coming up, with the real transaction history behind each booking including cash.",
      },
      {
        title: "Leads you couldn't see before",
        body: "Someone who saved an item or asked a question but never booked is now a person on a list, tagged with what they did. That's a follow-up call you didn't know you were owed.",
      },
      {
        title: "Notes and one-tap everything",
        body: "Private notes only your admins see, plus email, call, and book-again from the profile.",
      },
    ],
    capabilities: [
      { label: "Unified customer record" },
      { label: "Deduplicated across bookings, chats, and texts" },
      { label: "Collected, booked, count, and upcoming per customer" },
      { label: "Real payment history per booking, card and cash" },
      { label: "Private notes" },
      { label: "Activity timeline of bookings and conversations" },
      { label: "Leads list for people who haven't booked yet" },
      { label: "One-tap email, call, and book again" },
      { label: "Search by name, email, or phone" },
    ],
  },
  {
    id: "compliance",
    nav: "Paperwork",
    headline: "The binder in the truck, minus the binder",
    body: "Insurance, licenses, inspections, and permits stored privately, with expiry dates that warn you.",
    highlights: [
      {
        title: "Private by construction",
        body: "Documents live in private storage and download through short-lived signed links. There is no public URL to leak, and no other operator can reach yours.",
      },
      {
        title: "Expiry that finds you",
        body: "Dated certificates raise a dashboard warning and an email two weeks out, so a lapsed COI is something you renewed rather than something a venue discovered.",
      },
      {
        title: "Attached where it matters",
        body: "Pin a document to a specific booking or customer, so the certificate a venue asks for is filed against the job it belongs to.",
      },
      {
        title: "Policies written once",
        body: "Your cancellation and damage terms are entered a single time and rendered everywhere they matter: at checkout before payment, in the quote and confirmation emails, and in the agreement.",
      },
    ],
    capabilities: [
      { label: "Private document library" },
      { label: "Insurance, license, inspection, W-9, permit, waiver, contract" },
      { label: "Short-lived signed download links, never public" },
      { label: "Expiry dates tracked per document" },
      { label: "Dashboard warning before a document lapses" },
      { label: "Expiry reminder email two weeks out" },
      { label: "Attach documents to a booking or customer" },
      { label: "Cancellation and damage policies written once, shown everywhere" },
    ],
  },
  {
    id: "team",
    nav: "Team",
    headline: "Bring your crew in, without handing over the books",
    body: "Employees can run the day and take payments. Only admins can move money back out.",
    highlights: [
      {
        title: "Money in, not money out",
        body: "An employee can collect a balance and take cash on the doorstep, but cannot refund or cancel. Per-booking totals stay visible so they can do the job; your revenue figures stay yours.",
      },
      {
        title: "The route sheet in your driver's hand",
        body: "A driver seat is a login: the day's route on their phone, one-tap maps and calls, and mark-delivered that updates the whole business. No screenshots of addresses over text.",
      },
      {
        title: "Invite, change, remove",
        body: "Add a crew member by email, change their role, remove them when the season ends. The last admin can't lock themselves out.",
      },
      {
        title: "Set up in an afternoon",
        body: "A nine-step checklist walks you from an empty account to a live storefront, ticking itself off as you work: service area, rentals, payouts, documents, follow-ups, policies, branding, briefing the assistant, and a test drive of your own storefront. No onboarding call, no installer.",
      },
      {
        title: "More than one business",
        body: "One login can belong to several operations and switch between them, which matters if you run two brands or help a partner run theirs.",
      },
    ],
    capabilities: [
      { label: "Additional team members", gate: "teamMembers" },
      { label: "Driver logins for the daily route sheet", gate: "teamMembers" },
      { label: "Admin and Employee roles", gate: "teamMembers" },
      { label: "Employees take payments but cannot refund or cancel", gate: "teamMembers" },
      { label: "Aggregate revenue hidden from employees", gate: "teamMembers" },
      { label: "Invite by email, change role, remove", gate: "teamMembers" },
      { label: "One login, several businesses, switch between them" },
      { label: "Everyone manages their own name, email, and password" },
      { label: "Nine-step guided setup checklist" },
      { label: "Priority support", plans: ["growing"] },
    ],
  },
  {
    id: "security",
    nav: "Security",
    headline: "Built like it's holding your customers' data",
    body: "Because it is. Isolation at the database, payments through Stripe, and your renters left alone.",
    highlights: [
      {
        title: "Isolated at the database, not just the code",
        body: "Your records are fenced off by the database itself, so a bug in the application can't hand another operator your customer list. Belt and braces, verified by tests that run on every deploy.",
      },
      {
        title: "We never touch a card",
        body: "Checkout is hosted by Stripe and e-signatures by a dedicated provider. Card numbers never reach our servers.",
      },
      {
        title: "Your customers are yours",
        body: "We process renter data on your behalf and don't market to them. No cross-selling your customer list, ever.",
      },
      {
        title: "The money paths are tested",
        body: "Checkout, reservations, and payment webhooks are idempotent and covered by an automated suite that gates every deploy, so a retried payment can't double-charge or double-book.",
      },
    ],
    capabilities: [
      { label: "Database-level isolation between businesses" },
      { label: "Card data never reaches our servers" },
      { label: "We don't market to your customers" },
      { label: "Idempotent, test-gated payment and booking paths" },
      { label: "Error monitoring on every money path" },
      { label: "Hosted and maintained, nothing to install or update" },
    ],
  },
];

/** A resolved matrix cell. */
export type Cell = { kind: "yes" } | { kind: "no" } | { kind: "text"; text: string };

function formatQuota(key: QuotaKey, value: number): string {
  if (key === "platformFeeBps") return `${value / 100}%`;
  if (value === Infinity) return "Unlimited";
  return key === "aiQuotesPerMonth" ? `${value} / mo` : `${value}`;
}

/** What a plan gets for one capability, read out of `PLAN_CAPABILITIES`. */
export function capabilityCell(cap: Capability, planId: PlanId): Cell {
  const caps = PLAN_CAPABILITIES[planId];
  if (cap.quota) return { kind: "text", text: formatQuota(cap.quota, caps[cap.quota]) };
  if (cap.gate) return caps[cap.gate] ? { kind: "yes" } : { kind: "no" };
  if (cap.plans) return cap.plans.includes(planId) ? { kind: "yes" } : { kind: "no" };
  return { kind: "yes" };
}

function isLive(item: { live?: () => boolean }): boolean {
  return item.live ? item.live() : true;
}

/**
 * The groups as the page should render them: anything switched off in production
 * is filtered out of both the prose and the matrix, and a group left with no
 * live capabilities disappears entirely rather than becoming an empty heading.
 */
export function liveFeatureGroups(): FeatureGroup[] {
  return FEATURE_GROUPS.map((group) => ({
    ...group,
    highlights: group.highlights.filter(isLive),
    capabilities: group.capabilities.filter(isLive),
  })).filter((group) => group.capabilities.length > 0 && group.highlights.length > 0);
}
