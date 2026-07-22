import { describe, it, expect } from "vitest";
import { buildOperatorConfig } from "./operator-config";
import type { Operator } from "@/lib/inventory/types";
import type { AssistantPromo } from "@/lib/promos/repo";

function op(overrides: Partial<Operator> = {}): Operator {
  return {
    name: "Bounce USA",
    location: "Plymouth, MA",
    deliveryMode: "flat",
    deliveryConfig: {},
    availabilityConfig: {},
    minLeadHours: 0,
    ...overrides,
  } as Operator;
}

const TODAY = "2026-07-21";

describe("buildOperatorConfig", () => {
  it("is always non-empty and never states a price, even for a bare operator", () => {
    const c = buildOperatorConfig(op(), TODAY, []);
    expect(c.length).toBeGreaterThan(0);
    expect(c).toContain("Service area");
    expect(c).toContain("Operating days");
    expect(c).toContain("Deposit:");
    expect(c).not.toMatch(/\$\d/); // no dollar amounts
  });

  it("defaults an unconfigured schedule to open-every-day (nothing to delete)", () => {
    const c = buildOperatorConfig(op({ availabilityConfig: null }), TODAY, []);
    expect(c).toContain("open any day of the week");
  });

  it("renders operating days + lead time + future blackouts, skipping past ones", () => {
    const c = buildOperatorConfig(
      op({
        minLeadHours: 48,
        availabilityConfig: {
          operatingDays: [5, 6, 0], // Fri, Sat, Sun
          deliveryWindows: ["9–11 AM", "1–3 PM"],
          blackouts: [
            { start: "2026-01-01", end: "2026-01-01" }, // past → dropped
            { start: "2026-12-24", end: "2026-12-26" }, // future → kept
          ],
        },
      }),
      TODAY,
      [],
    );
    expect(c).toContain("Sun, Fri, Sat"); // normalizeSchedule sorts days ascending
    expect(c).toContain("at least 2 days");
    expect(c).toContain("Delivery time windows: 9–11 AM; 1–3 PM.");
    expect(c).toContain("Dec 24, 2026");
    expect(c).not.toContain("Jan 1, 2026");
  });

  it("describes a distance service area with a max range", () => {
    const c = buildOperatorConfig(
      op({ deliveryMode: "distance", deliveryConfig: { distance: { freeMiles: 10, perMileCents: 200, maxMiles: 30 } } }),
      TODAY,
      [],
    );
    expect(c).toContain("delivers within 30 miles");
  });

  it("lists active auto-promos qualitatively, without amounts", () => {
    const promos: AssistantPromo[] = [
      { trigger: "weekday", weekdays: [1, 2, 3, 4] },
      { trigger: "repeat", weekdays: [] },
    ];
    const c = buildOperatorConfig(op(), TODAY, promos);
    expect(c).toContain("weekday discount (Mon/Tue/Wed/Thu)");
    expect(c).toContain("repeat-customer discount");
    expect(c).toContain("never state amounts");
  });

  it("omits the promo line when there are no auto-promos", () => {
    expect(buildOperatorConfig(op(), TODAY, [])).not.toContain("Automatic promotions");
  });
});
