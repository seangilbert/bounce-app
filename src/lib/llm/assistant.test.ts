import { describe, it, expect } from "vitest";
import { buildSystemPrompt } from "./assistant";
import type { Operator } from "@/lib/inventory/types";

/** Minimal operator — buildSystemPrompt only reads name/location/assistantInstructions. */
function op(overrides: Partial<Operator> = {}): Operator {
  return {
    name: "Bounce USA",
    location: "Plymouth, MA",
    assistantInstructions: null,
    ...overrides,
  } as Operator;
}

const CATALOG = "abc | Rainbow Castle | $200";

describe("buildSystemPrompt — operator assistant instructions", () => {
  it("omits the guidance block when there are no instructions", () => {
    const p = buildSystemPrompt(op(), "2026-07-21", CATALOG, true);
    expect(p).not.toContain("Guidance from");
    expect(p).toContain("How to behave:");
  });

  it("omits the block when instructions are blank/whitespace", () => {
    const p = buildSystemPrompt(op({ assistantInstructions: "   \n  " }), "2026-07-21", CATALOG, true);
    expect(p).not.toContain("Guidance from");
  });

  it("injects the operator's instructions, attributed, with a precedence guard", () => {
    const p = buildSystemPrompt(
      op({ assistantInstructions: "Always upsell tables & chairs. Keep it casual." }),
      "2026-07-21",
      CATALOG,
      true,
    );
    expect(p).toContain("Guidance from Bounce USA (the business owner)");
    expect(p).toContain("Always upsell tables & chairs.");
    // The core rules must be stated to win on conflict.
    expect(p).toContain("core rules below always take precedence");
    // Guidance sits before the core behavior rules.
    expect(p.indexOf("Guidance from")).toBeLessThan(p.indexOf("How to behave:"));
  });
});
