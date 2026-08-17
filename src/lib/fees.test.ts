import { describe, it, expect, afterEach } from "vitest";
import { applicationFeeCents, surchargeBps, PROCESSING_FEE_FIXED_CENTS } from "./fees";

const FREE = { plan: "free", subscriptionStatus: null };
const SOLO = { plan: "solo", subscriptionStatus: "active" };
const GROWING = { plan: "growing", subscriptionStatus: "active" };

afterEach(() => {
  delete process.env.PLATFORM_FEE_BPS;
});

describe("applicationFeeCents", () => {
  it("charges Free the processing pass-through plus the 2% surcharge", () => {
    // $100 booking: 4.9% = 490¢, + 30¢ fixed.
    expect(applicationFeeCents(10_000, FREE)).toBe(520);
  });

  it("charges paid plans the pass-through only", () => {
    // $100 booking: 2.9% = 290¢, + 30¢ fixed.
    expect(applicationFeeCents(10_000, SOLO)).toBe(320);
    expect(applicationFeeCents(10_000, GROWING)).toBe(320);
  });

  it("a lapsed paid plan pays Free's surcharge (effective-plan belt)", () => {
    expect(applicationFeeCents(10_000, { plan: "solo", subscriptionStatus: "canceled" })).toBe(520);
  });

  it("a billing-exempt (comp) account pays the paid-plan rate", () => {
    expect(
      applicationFeeCents(10_000, { plan: "free", subscriptionStatus: null, billingExempt: true }),
    ).toBe(320);
  });

  it("rounds the bps portion and always adds the fixed cost", () => {
    // $250.55 on Solo: 25055 × 290 / 10000 = 726.595 → 727, + 30.
    expect(applicationFeeCents(25_055, SOLO)).toBe(757);
    expect(applicationFeeCents(1_000, SOLO)).toBe(29 + PROCESSING_FEE_FIXED_CENTS);
  });

  it("clamps to the charge amount so Stripe never rejects the fee", () => {
    expect(applicationFeeCents(25, SOLO)).toBe(25);
  });

  it("returns 0 for a non-positive amount", () => {
    expect(applicationFeeCents(0, FREE)).toBe(0);
    expect(applicationFeeCents(-100, FREE)).toBe(0);
  });

  it("PLATFORM_FEE_BPS overrides the plan surcharge for every plan", () => {
    process.env.PLATFORM_FEE_BPS = "100";
    // 2.9% + 1% = 3.9% → 390¢ + 30¢, on Free and Solo alike.
    expect(applicationFeeCents(10_000, FREE)).toBe(420);
    expect(applicationFeeCents(10_000, SOLO)).toBe(420);
  });
});

describe("surchargeBps", () => {
  it("reads the effective plan's surcharge", () => {
    expect(surchargeBps(FREE)).toBe(200);
    expect(surchargeBps(SOLO)).toBe(0);
    expect(surchargeBps(GROWING)).toBe(0);
  });
});
