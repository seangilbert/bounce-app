import { describe, it, expect } from "vitest";
import { durationDays, lineTotal, priceBreakdown } from "./pricing";

describe("durationDays", () => {
  it("counts a same-day rental as 1", () => {
    expect(durationDays("2026-07-04", "2026-07-04")).toBe(1);
  });

  it("is inclusive of both endpoints", () => {
    expect(durationDays("2026-07-04", "2026-07-06")).toBe(3);
  });

  it("counts across a month boundary", () => {
    expect(durationDays("2026-06-30", "2026-07-02")).toBe(3);
  });

  it("is not thrown off by DST (uses UTC midnight)", () => {
    // US DST spring-forward is 2026-03-08; a naive local-time diff would drop an hour.
    expect(durationDays("2026-03-07", "2026-03-09")).toBe(3);
  });
});

describe("lineTotal", () => {
  it("scales per_day by the rental length", () => {
    // $50/day * 2 units * 3 days
    expect(lineTotal(5000, "per_day", 2, 3)).toBe(30000);
  });

  it("does not multiply flat rates across days", () => {
    expect(lineTotal(5000, "flat", 2, 3)).toBe(10000);
  });

  it("treats per_hour as a one-time day-level charge (no day multiply)", () => {
    expect(lineTotal(5000, "per_hour", 2, 3)).toBe(10000);
  });
});

describe("priceBreakdown", () => {
  it("computes tax on discounted subtotal plus taxable delivery", () => {
    // subtotal 10000, delivery 1500, 10% tax, taxable delivery, no discount
    const b = priceBreakdown(10000, 1500, 10);
    expect(b).toEqual({ subtotal: 10000, discount: 0, deliveryFee: 1500, tax: 1150, total: 12650 });
  });

  it("excludes delivery from the tax base when delivery is not taxable", () => {
    const b = priceBreakdown(10000, 1500, 10, false);
    // tax only on 10000 => 1000
    expect(b.tax).toBe(1000);
    expect(b.total).toBe(12500);
  });

  it("applies a discount to the subtotal before tax, and never taxes it", () => {
    // 10000 - 2000 discount = 8000 net; +1500 delivery; 10% tax on 9500 = 950
    const b = priceBreakdown(10000, 1500, 10, true, 2000);
    expect(b).toEqual({ subtotal: 10000, discount: 2000, deliveryFee: 1500, tax: 950, total: 10450 });
  });

  it("clamps a discount larger than the subtotal (never negative net)", () => {
    const b = priceBreakdown(10000, 1500, 10, true, 99999);
    expect(b.discount).toBe(10000);
    // net subtotal 0; tax on delivery only (1500 * 10% = 150); total 1650
    expect(b.total).toBe(1650);
  });

  it("floors a negative discount input to zero", () => {
    const b = priceBreakdown(10000, 0, 0, true, -500);
    expect(b.discount).toBe(0);
    expect(b.total).toBe(10000);
  });

  it("rounds tax to the nearest cent", () => {
    // 10% of 1005 = 100.5 => rounds to 101
    const b = priceBreakdown(1005, 0, 10);
    expect(b.tax).toBe(101);
  });

  it("handles a zero-tax, zero-delivery order", () => {
    const b = priceBreakdown(4200, 0, 0);
    expect(b).toEqual({ subtotal: 4200, discount: 0, deliveryFee: 0, tax: 0, total: 4200 });
  });
});
