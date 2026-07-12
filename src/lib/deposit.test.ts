import { describe, it, expect } from "vitest";
import { depositAmount, DEPOSIT_PERCENT } from "./deposit";

describe("depositAmount", () => {
  it("defaults to 30%", () => {
    expect(DEPOSIT_PERCENT).toBe(30);
    expect(depositAmount(10000)).toBe(3000);
  });

  it("rounds to the nearest cent", () => {
    // 30% of 3333 = 999.9 → 1000
    expect(depositAmount(3333)).toBe(1000);
  });

  it("honors a custom percent", () => {
    expect(depositAmount(10000, 50)).toBe(5000);
  });

  it("is zero for a zero subtotal", () => {
    expect(depositAmount(0)).toBe(0);
  });
});
