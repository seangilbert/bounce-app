import { describe, it, expect } from "vitest";
import { computeDiscount, promoLabel } from "./repo";

describe("computeDiscount", () => {
  it("computes a percent discount rounded to the nearest cent", () => {
    // 15% of 10000 = 1500
    expect(computeDiscount({ kind: "percent", value: 15 }, 10000)).toBe(1500);
    // 15% of 3333 = 499.95 → 500
    expect(computeDiscount({ kind: "percent", value: 15 }, 3333)).toBe(500);
  });

  it("applies a fixed discount capped at the subtotal", () => {
    expect(computeDiscount({ kind: "fixed", value: 2000 }, 10000)).toBe(2000);
    expect(computeDiscount({ kind: "fixed", value: 20000 }, 10000)).toBe(10000);
  });

  it("caps a >100% percent discount at the subtotal", () => {
    expect(computeDiscount({ kind: "percent", value: 150 }, 10000)).toBe(10000);
  });

  it("never returns a negative discount", () => {
    expect(computeDiscount({ kind: "fixed", value: -500 }, 10000)).toBe(0);
    expect(computeDiscount({ kind: "percent", value: -10 }, 10000)).toBe(0);
  });
});

describe("promoLabel", () => {
  it("uses friendly labels for auto-triggered promos", () => {
    expect(promoLabel({ trigger: "weekday", code: "X" })).toBe("Weekday discount");
    expect(promoLabel({ trigger: "repeat", code: "X" })).toBe("Returning customer");
  });
  it("shows the code for code-triggered promos", () => {
    expect(promoLabel({ trigger: "code", code: "SAVE10" })).toBe("SAVE10");
  });
});
