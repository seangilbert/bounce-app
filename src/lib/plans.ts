/**
 * Operator subscription plans — the SaaS's own billing (distinct from the
 * customer rental payments). Solo/Growing are monthly Stripe subscriptions with
 * a trial; Free requires no card. Prices are resolved in Stripe by lookup_key
 * (see scripts/setup_billing.mjs), so no price IDs live in code.
 */
export type PlanId = "free" | "solo" | "growing";

export interface Plan {
  id: PlanId;
  name: string;
  priceCents: number; // per month
  stripeLookupKey: string | null; // null for Free
  tagline: string;
  features: string[];
}

/** Free trial length (days) for paid plans. */
export const TRIAL_DAYS = 14;

export const PLANS: Record<PlanId, Plan> = {
  free: {
    id: "free",
    name: "Free",
    priceCents: 0,
    stripeLookupKey: null,
    tagline: "Try it out",
    features: ["Up to 20 quotes / month", "AI quote assistant", "Storefront + checkout"],
  },
  solo: {
    id: "solo",
    name: "Solo",
    priceCents: 3900,
    stripeLookupKey: "solo_monthly",
    tagline: "For a solo operator",
    features: [
      "Unlimited quotes",
      "0% platform fee on bookings",
      "E-signed rental agreements",
      "Automated follow-ups (quotes, balances, contracts)",
    ],
  },
  growing: {
    id: "growing",
    name: "Growing",
    priceCents: 7900,
    stripeLookupKey: "growing_monthly",
    tagline: "For a growing team",
    features: ["Everything in Solo", "Team members & driver logins", "Priority support"],
  },
};

export const PLAN_LIST: Plan[] = [PLANS.free, PLANS.solo, PLANS.growing];

export function isPaidPlan(id: PlanId): boolean {
  return id !== "free";
}

/** Hard limits per tier. `Infinity` = unlimited. */
export interface PlanCapabilities {
  /** Max catalog items an operator can create (the scale lever). */
  maxItems: number;
  /** AI-assisted quotes per calendar month (controls our Anthropic cost). */
  aiQuotesPerMonth: number;
  /** Can invite additional operator_members. */
  teamMembers: boolean;
  /** API keys + embeddable widget (bring-your-own-website). */
  apiAccess: boolean;
  /** Automated customer-facing follow-up emails (balance / quote / contract
   *  agents). Enforced in the UI, the toggle action, AND the cron sweep — a
   *  downgrade stops sends even if the operator's toggles stay on. */
  followUpAgents: boolean;
  /** E-signed rental agreements (paid-plan capability — every live SignWell
   *  document is a per-doc platform cost). Enforced at the send choke point
   *  (`sendAgreementForOrder`), so the webhook / any future caller inherits it. */
  esignContracts: boolean;
  /** Platform surcharge on customer bookings, in basis points, charged ON TOP of
   *  the processing pass-through (see `lib/fees.ts`). The Free tier's 2% is what
   *  makes free riders self-funding; dropping to 0% on paid plans is the upgrade
   *  math ("Solo pays for itself at ~$1,450/mo in bookings"). Decided in
   *  docs/pricing-plan.md (2026-08-17). */
  platformFeeBps: number;
}

export const PLAN_CAPABILITIES: Record<PlanId, PlanCapabilities> = {
  free: {
    maxItems: 5,
    aiQuotesPerMonth: 20,
    teamMembers: false,
    apiAccess: false,
    followUpAgents: false,
    esignContracts: false,
    platformFeeBps: 200,
  },
  solo: {
    maxItems: Infinity,
    aiQuotesPerMonth: Infinity,
    teamMembers: false,
    apiAccess: false,
    followUpAgents: true,
    esignContracts: true,
    platformFeeBps: 0,
  },
  growing: {
    maxItems: Infinity,
    aiQuotesPerMonth: Infinity,
    teamMembers: true,
    apiAccess: true,
    followUpAgents: true,
    esignContracts: true,
    platformFeeBps: 0,
  },
};

/** Subscription statuses that still entitle a paid plan (incl. past_due grace). */
const ENTITLED_STATUSES = new Set(["trialing", "active", "past_due"]);

/** The tier a billing-exempt (comp / internal) operator always gets — the top
 *  paid plan, independent of any subscription state. */
export const COMP_PLAN_ID: PlanId = "growing";

type Billed = { plan: string | null; subscriptionStatus: string | null; billingExempt?: boolean | null };

/**
 * The tier an operator is actually entitled to *right now*.
 *
 * A billing-exempt (comp/internal) operator is always on the top tier, immune to
 * subscription state — this is what makes a comped account durable: even a
 * missed or late billing webhook, a lapsed status, or a stray checkout can't
 * downgrade it. Otherwise a paid `plan` only counts while its subscription is in
 * good standing (trialing/active, plus a past_due grace window); else the
 * operator falls back to Free. This is the belt to the webhook's suspenders.
 */
export function effectivePlanId(op: Billed): PlanId {
  if (op.billingExempt) return COMP_PLAN_ID;
  const plan = (op.plan as PlanId) in PLANS ? (op.plan as PlanId) : "free";
  if (plan === "free") return "free";
  return op.subscriptionStatus && ENTITLED_STATUSES.has(op.subscriptionStatus) ? plan : "free";
}

export function planCapabilities(op: Billed): PlanCapabilities {
  return PLAN_CAPABILITIES[effectivePlanId(op)];
}
