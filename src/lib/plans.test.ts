import { describe, it, expect } from "vitest";
import { effectivePlanId, planCapabilities, isPaidPlan, PLAN_CAPABILITIES } from "./plans";

describe("isPaidPlan", () => {
  it("treats free as unpaid and solo/growing as paid", () => {
    expect(isPaidPlan("free")).toBe(false);
    expect(isPaidPlan("solo")).toBe(true);
    expect(isPaidPlan("growing")).toBe(true);
  });
});

describe("effectivePlanId", () => {
  it("returns free for a free plan regardless of status", () => {
    expect(effectivePlanId({ plan: "free", subscriptionStatus: null })).toBe("free");
    expect(effectivePlanId({ plan: "free", subscriptionStatus: "active" })).toBe("free");
  });

  it("honors a paid plan while trialing/active/past_due", () => {
    expect(effectivePlanId({ plan: "growing", subscriptionStatus: "trialing" })).toBe("growing");
    expect(effectivePlanId({ plan: "solo", subscriptionStatus: "active" })).toBe("solo");
    expect(effectivePlanId({ plan: "growing", subscriptionStatus: "past_due" })).toBe("growing");
  });

  it("downgrades a paid plan to free once the subscription lapses", () => {
    expect(effectivePlanId({ plan: "growing", subscriptionStatus: "canceled" })).toBe("free");
    expect(effectivePlanId({ plan: "solo", subscriptionStatus: "unpaid" })).toBe("free");
    expect(effectivePlanId({ plan: "growing", subscriptionStatus: null })).toBe("free");
  });

  it("keeps a billing-exempt (comp) account on the top tier no matter the billing state", () => {
    // Immune to a lapsed status, a free/unset plan, or no subscription at all.
    expect(effectivePlanId({ plan: "growing", subscriptionStatus: "canceled", billingExempt: true })).toBe("growing");
    expect(effectivePlanId({ plan: "free", subscriptionStatus: null, billingExempt: true })).toBe("growing");
    expect(effectivePlanId({ plan: null, subscriptionStatus: null, billingExempt: true })).toBe("growing");
    // And a comp account gets the full top-tier capabilities.
    expect(planCapabilities({ plan: "free", subscriptionStatus: null, billingExempt: true })).toEqual(
      PLAN_CAPABILITIES.growing,
    );
  });

  it("falls back to free for an unknown plan value", () => {
    expect(effectivePlanId({ plan: "enterprise", subscriptionStatus: "active" })).toBe("free");
    expect(effectivePlanId({ plan: null, subscriptionStatus: "active" })).toBe("free");
  });
});

describe("planCapabilities", () => {
  it("returns Free caps for a lapsed paid subscription (belt to the webhook)", () => {
    const caps = planCapabilities({ plan: "growing", subscriptionStatus: "canceled" });
    expect(caps).toEqual(PLAN_CAPABILITIES.free);
    expect(caps.teamMembers).toBe(false);
    expect(caps.maxItems).toBe(5);
  });

  it("returns Growing caps for an active growing subscription", () => {
    const caps = planCapabilities({ plan: "growing", subscriptionStatus: "active" });
    expect(caps.teamMembers).toBe(true);
    expect(caps.apiAccess).toBe(true);
    expect(caps.maxItems).toBe(Infinity);
  });

  it("gates team + API off for Solo even when active", () => {
    const caps = planCapabilities({ plan: "solo", subscriptionStatus: "active" });
    expect(caps.teamMembers).toBe(false);
    expect(caps.apiAccess).toBe(false);
    expect(caps.aiQuotesPerMonth).toBe(Infinity);
  });
});
