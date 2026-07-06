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
    priceCents: 2900,
    stripeLookupKey: "solo_monthly",
    tagline: "For a solo operator",
    features: ["Unlimited quotes", "Full catalog & calendar", "Payments + e-signature"],
  },
  growing: {
    id: "growing",
    name: "Growing",
    priceCents: 5900,
    stripeLookupKey: "growing_monthly",
    tagline: "For a growing team",
    features: ["Everything in Solo", "Team members", "Priority support"],
  },
};

export const PLAN_LIST: Plan[] = [PLANS.free, PLANS.solo, PLANS.growing];

export function isPaidPlan(id: PlanId): boolean {
  return id !== "free";
}
