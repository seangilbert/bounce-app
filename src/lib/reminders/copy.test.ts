import { describe, it, expect } from "vitest";
import { fallbackReminderIntro } from "./copy";
import { buildReminderSystemPrompt } from "@/lib/llm/assistant";
import type { Operator } from "@/lib/inventory/types";

const FACTS = {
  customerFirstName: "Jane",
  eventDateLabel: "Saturday, June 1",
  itemNames: ["Rainbow Castle"],
  balanceLabel: "$200",
};

const op = (over: Partial<Operator> = {}) =>
  ({ name: "Bounce USA", assistantInstructions: null, ...over }) as Operator;

describe("fallbackReminderIntro — the deterministic floor", () => {
  it("renders the facts verbatim for a balance reminder", () => {
    const s = fallbackReminderIntro("balance", "Bounce USA", FACTS);
    expect(s).toContain("Jane");
    expect(s).toContain("Bounce USA");
    expect(s).toContain("Saturday, June 1");
    expect(s).toContain("$200");
  });

  it("handles a missing first name and missing balance label", () => {
    const s = fallbackReminderIntro("balance", "Bounce USA", {
      eventDateLabel: "Saturday, June 1",
      itemNames: [],
    });
    expect(s).toContain("Hi there");
    expect(s).not.toContain("undefined");
  });

  it("contract copy points at the signature, not money", () => {
    const s = fallbackReminderIntro("contract", "Bounce USA", FACTS);
    expect(s).toContain("waiting for your signature");
    expect(s).not.toContain("$200");
  });

  it("quote copy checks in without pressure — no balance, no signature talk", () => {
    const s = fallbackReminderIntro("quote", "Bounce USA", FACTS);
    expect(s).toContain("Jane");
    expect(s).toContain("Bounce USA");
    expect(s).toContain("Saturday, June 1");
    expect(s).toContain("still available");
    expect(s).not.toContain("$200");
    expect(s).not.toContain("signature");
  });
});

describe("buildReminderSystemPrompt — auto-send hard rules", () => {
  it("bakes in the no-placeholder / no-link / facts-only rules", () => {
    const p = buildReminderSystemPrompt(op(), "balance");
    expect(p).toContain("No placeholders");
    expect(p).toContain("No links or URLs");
    expect(p).toContain("ONLY the facts provided");
    expect(p).toContain("no human review");
    expect(p).toContain("Bounce USA");
  });

  it("differs per kind on the point of the email", () => {
    expect(buildReminderSystemPrompt(op(), "balance")).toContain("remaining balance is due");
    expect(buildReminderSystemPrompt(op(), "contract")).toContain("signing email comes from SignWell");
    expect(buildReminderSystemPrompt(op(), "quote")).toContain("never pressure");
  });

  it("appends operator tone guidance without letting it override the rules", () => {
    const p = buildReminderSystemPrompt(op({ assistantInstructions: "Keep it playful!" }), "balance");
    expect(p).toContain("Keep it playful!");
    expect(p).toContain("does not override the rules above");
    expect(p.indexOf("No placeholders")).toBeLessThan(p.indexOf("Keep it playful!"));
  });

  it("never contains the copilot's [FILL IN] escape hatch", () => {
    expect(buildReminderSystemPrompt(op(), "balance")).not.toContain("[FILL IN]");
    expect(buildReminderSystemPrompt(op(), "contract")).not.toContain("[FILL IN]");
    expect(buildReminderSystemPrompt(op(), "quote")).not.toContain("[FILL IN]");
  });
});
