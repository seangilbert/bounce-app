import { describe, it, expect } from "vitest";
import { buildSystemPrompt, handleInquiry } from "./assistant";
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
const CONFIG = "- Service area: delivers around Plymouth, MA.\n- Operating days: open any day of the week.";

describe("buildSystemPrompt — operator assistant instructions", () => {
  it("omits the guidance block when there are no instructions", () => {
    const p = buildSystemPrompt(op(), "2026-07-21", CATALOG, true, CONFIG);
    expect(p).not.toContain("Guidance from");
    expect(p).toContain("How to behave:");
  });

  it("omits the block when instructions are blank/whitespace", () => {
    const p = buildSystemPrompt(op({ assistantInstructions: "   \n  " }), "2026-07-21", CATALOG, true, CONFIG);
    expect(p).not.toContain("Guidance from");
  });

  it("injects the operator's instructions, attributed, with a precedence guard", () => {
    const p = buildSystemPrompt(
      op({ assistantInstructions: "Always upsell tables & chairs. Keep it casual." }),
      "2026-07-21",
      CATALOG,
      true,
      CONFIG,
    );
    expect(p).toContain("Guidance from Bounce USA (the business owner)");
    expect(p).toContain("Always upsell tables & chairs.");
    // The core rules must be stated to win on conflict.
    expect(p).toContain("core rules below always take precedence");
    // Guidance sits before the core behavior rules.
    expect(p.indexOf("Guidance from")).toBeLessThan(p.indexOf("How to behave:"));
  });
});

describe("buildSystemPrompt — universal agent behavior (core, every operator)", () => {
  // These live in code so a brand-new operator inherits them with NO custom
  // instructions — they must be present even when assistantInstructions is null.
  it("bakes voice, handoff, safety, add-on, objection, and discount conduct into the core prompt", () => {
    const p = buildSystemPrompt(op(), "2026-07-21", CATALOG, true, CONFIG);
    expect(p).toContain("Voice:");
    expect(p).toContain("not a person"); // never claim to be human
    expect(p).toContain("HAND OFF to a human");
    expect(p).toContain("SAFETY beats a sale");
    expect(p).toContain("ADD-ONS:");
    expect(p).toContain("OBJECTIONS:");
    expect(p).toContain("DISCOUNTS:");
    expect(p).toContain("REUSE what's already known");
    expect(p).toContain('Respect "no" immediately');
  });

  it("keeps item-specific hazards out of core — safety defers to the owner's guidance", () => {
    const p = buildSystemPrompt(op(), "2026-07-21", CATALOG, true, CONFIG);
    // The core prompt states the principle but names no category-specific hazard.
    expect(p).toContain("item-specific hazards to watch for come from the owner's guidance");
    expect(p).not.toMatch(/anchoring|wet\/dry|Hometown Heroes/i);
  });
});

describe("handleInquiry — operator scoping", () => {
  it("refuses to run without an operatorId (no silent default to another tenant)", async () => {
    // Throws before any DB/model call, so no mocks needed.
    await expect(handleInquiry({ messages: [{ role: "user", content: "hi" }] })).rejects.toThrow(/operatorId/);
  });
});

describe("buildSystemPrompt — operator config block", () => {
  it("always renders the config block, before the catalog, and tells the model to respect it", () => {
    const p = buildSystemPrompt(op(), "2026-07-21", CATALOG, true, CONFIG);
    expect(p).toContain("booking config — firm operating facts");
    expect(p).toContain("Service area: delivers around Plymouth, MA.");
    expect(p).toContain("Honor the booking config");
    // Config comes before the catalog.
    expect(p.indexOf("booking config")).toBeLessThan(p.indexOf("Your catalog"));
  });
});
