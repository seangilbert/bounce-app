import { describe, expect, it } from "vitest";
import { applyLiveItemCap, liveCatalog } from "./live-cap";

const item = (id: string, createdAt: string) => ({ id, createdAt });

describe("applyLiveItemCap", () => {
  it("passes everything through when the cap is Infinity", () => {
    const items = [item("a", "2026-01-02"), item("b", "2026-01-01")];
    expect(applyLiveItemCap(items, Infinity)).toBe(items);
  });

  it("passes everything through when at or under the cap", () => {
    const items = [item("a", "2026-01-02"), item("b", "2026-01-01")];
    expect(applyLiveItemCap(items, 2)).toBe(items);
  });

  it("keeps the oldest items when over the cap", () => {
    const items = [
      item("new", "2026-03-01"),
      item("oldest", "2026-01-01"),
      item("mid", "2026-02-01"),
    ];
    expect(applyLiveItemCap(items, 2).map((i) => i.id)).toEqual(["oldest", "mid"]);
  });

  it("preserves the input (presentation) order of the survivors", () => {
    const items = [
      item("c", "2026-01-03"),
      item("a", "2026-01-01"),
      item("b", "2026-01-02"),
    ];
    // a and b survive, but the list stays in the caller's order.
    expect(applyLiveItemCap(items, 2).map((i) => i.id)).toEqual(["a", "b"]);
  });

  it("tie-breaks equal timestamps by id so the set is deterministic", () => {
    const items = [item("b", "2026-01-01"), item("a", "2026-01-01")];
    expect(applyLiveItemCap(items, 1).map((i) => i.id)).toEqual(["a"]);
  });

  it("tolerates a zero cap", () => {
    expect(applyLiveItemCap([item("a", "2026-01-01")], 0)).toEqual([]);
  });
});

describe("liveCatalog", () => {
  const six = Array.from({ length: 6 }, (_, i) => item(`i${i}`, `2026-01-0${i + 1}`));

  it("caps a free operator at the free-plan limit", () => {
    expect(liveCatalog({ plan: "free", subscriptionStatus: null }, six)).toHaveLength(5);
  });

  it("caps a lapsed paid operator like a free one (per-request fallback)", () => {
    expect(liveCatalog({ plan: "growing", subscriptionStatus: "canceled" }, six)).toHaveLength(5);
  });

  it("leaves a trialing operator uncapped", () => {
    expect(liveCatalog({ plan: "solo", subscriptionStatus: "trialing" }, six)).toHaveLength(6);
  });

  it("leaves a billing-exempt operator uncapped regardless of state", () => {
    expect(
      liveCatalog({ plan: "free", subscriptionStatus: null, billingExempt: true }, six),
    ).toHaveLength(6);
  });
});
