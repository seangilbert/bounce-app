import { describe, it, expect } from "vitest";
import { toApiMessages } from "./thread";
import type { ThreadMessage } from "./repo";

const msg = (sender: ThreadMessage["sender"], body: string, i = 0): ThreadMessage => ({
  id: `m${i}`,
  sender,
  body,
  createdAt: `2026-08-01T00:00:0${i}Z`,
});

describe("toApiMessages", () => {
  it("maps customer → user and ai/operator → assistant", () => {
    const out = toApiMessages([msg("customer", "hi", 0), msg("ai", "hello!", 1), msg("operator", "it's Sam", 2)]);
    expect(out).toEqual([
      { role: "user", content: "hi" },
      // ai + operator are consecutive assistant turns — merged below
      { role: "assistant", content: "hello!\nit's Sam" },
    ]);
  });

  it("merges consecutive same-role messages", () => {
    const out = toApiMessages([msg("customer", "one", 0), msg("customer", "two", 1), msg("ai", "reply", 2)]);
    expect(out).toEqual([
      { role: "user", content: "one\ntwo" },
      { role: "assistant", content: "reply" },
    ]);
  });

  it("drops leading assistant turns so the array starts with user", () => {
    const out = toApiMessages([msg("ai", "auto-answer", 0), msg("customer", "question", 1)]);
    expect(out[0]).toEqual({ role: "user", content: "question" });
  });

  it("skips blank bodies", () => {
    const out = toApiMessages([msg("customer", "  ", 0), msg("customer", "real", 1)]);
    expect(out).toEqual([{ role: "user", content: "real" }]);
  });

  it("caps to the recent tail (30 merged turns)", () => {
    const thread: ThreadMessage[] = [];
    for (let i = 0; i < 40; i++) {
      thread.push(msg(i % 2 === 0 ? "customer" : "ai", `m${i}`, i));
    }
    const out = toApiMessages(thread);
    expect(out.length).toBeLessThanOrEqual(30);
    expect(out[0]!.role).toBe("user");
  });
});
