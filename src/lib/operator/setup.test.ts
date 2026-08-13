import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Setup checklist derivation: which steps apply, what counts as done, and the
 * never-500 posture on a failed count. Counts are fed through a queued thenable
 * stub in call order — items, documents, inquiries.
 */

const { queued, calls } = vi.hoisted(() => ({
  queued: [] as { count: number | null; error: { message: string } | null }[],
  calls: [] as { table: string; method: string; args: unknown[] }[],
}));

vi.mock("@/utils/supabase/server", () => ({
  createClient: () => ({
    from: (table: string) => {
      const result = queued.shift() ?? { count: 0, error: null };
      const b: Record<string, unknown> = {};
      for (const m of ["select", "eq", "in", "not"]) {
        b[m] = (...args: unknown[]) => {
          calls.push({ table, method: m, args });
          return b;
        };
      }
      b.then = (res: (v: unknown) => unknown) => Promise.resolve(result).then(res);
      return b;
    },
  }),
}));

import { getSetupProgress, type SetupStepKey } from "./setup";
import type { Operator } from "@/lib/inventory/types";

/** Nothing done: no location, policies, logo, instructions or agent toggles. */
const BLANK = {
  id: "op-1",
  name: "Bounce USA",
  location: null,
  plan: "solo",
  subscriptionStatus: "active",
  billingExempt: false,
  connectChargesEnabled: false,
  cancellationPolicy: null,
  damagePolicy: null,
  logoUrl: null,
  assistantInstructions: null,
  remindBalance: false,
  remindContract: false,
  remindQuote: false,
  setupDismissedAt: null,
} as unknown as Operator;

const op = (over: Partial<Operator> = {}): Operator => ({ ...BLANK, ...over }) as Operator;

/** items, documents, inquiries — the order getSetupProgress issues them in. */
function queueCounts(items: number, docs: number, inquiries: number) {
  queued.length = 0;
  for (const count of [items, docs, inquiries]) queued.push({ count, error: null });
}

const doneKeys = (steps: { key: SetupStepKey; done: boolean }[]) =>
  steps.filter((s) => s.done).map((s) => s.key);

beforeEach(() => {
  queueCounts(0, 0, 0);
  calls.length = 0;
});

describe("getSetupProgress", () => {
  it("a brand-new operator has nothing done", async () => {
    const p = await getSetupProgress(op());
    expect(p.doneCount).toBe(0);
    expect(p.total).toBe(9);
    expect(p.complete).toBe(false);
    expect(p.dismissed).toBe(false);
    expect(p.steps.map((s) => s.key)).toEqual([
      "location",
      "items",
      "payments",
      "documents",
      "followUps",
      "policies",
      "branding",
      "voice",
      "testDrive",
    ]);
  });

  it("ticks each step off its own evidence", async () => {
    queueCounts(3, 1, 2);
    const p = await getSetupProgress(
      op({
        location: "Plymouth, MA",
        connectChargesEnabled: true,
        cancellationPolicy: "48 hours",
        damagePolicy: "You break it",
        logoUrl: "https://cdn/logo.png",
        assistantInstructions: "Be warm.",
        remindQuote: true,
      }),
    );
    expect(p.complete).toBe(true);
    expect(p.doneCount).toBe(9);
    expect(p.itemCount).toBe(3);
  });

  it("counts a step undone when its value is blank rather than absent", async () => {
    const p = await getSetupProgress(
      op({ location: "   ", cancellationPolicy: "48 hours", damagePolicy: "  " }),
    );
    expect(doneKeys(p.steps)).toEqual([]); // whitespace policies/location don't count
  });

  it("needs BOTH customer policies before the policies step is done", async () => {
    const p = await getSetupProgress(op({ cancellationPolicy: "48 hours" }));
    expect(doneKeys(p.steps)).toEqual([]);
  });

  it("any one follow-up agent counts — the step is about turning the team on", async () => {
    const p = await getSetupProgress(op({ remindBalance: true }));
    expect(doneKeys(p.steps)).toEqual(["followUps"]);
  });

  it("drops the follow-ups step on a plan that can't use it", async () => {
    const p = await getSetupProgress(op({ plan: "free", subscriptionStatus: null }));
    expect(p.total).toBe(8);
    expect(p.steps.some((s) => s.key === "followUps")).toBe(false);
  });

  it("a lapsed paid plan loses the step too; a comp account keeps it", async () => {
    const lapsed = await getSetupProgress(op({ plan: "solo", subscriptionStatus: "canceled" }));
    expect(lapsed.steps.some((s) => s.key === "followUps")).toBe(false);
    queueCounts(0, 0, 0);
    const comp = await getSetupProgress(op({ plan: "free", billingExempt: true }));
    expect(comp.steps.some((s) => s.key === "followUps")).toBe(true);
  });

  it("only tracked-expiry documents WITH a date count toward compliance", async () => {
    await getSetupProgress(op());
    const docCalls = calls.filter((c) => c.table === "documents");
    expect(docCalls.find((c) => c.method === "in")?.args).toEqual([
      "type",
      ["coi", "license", "inspection", "permit"],
    ]);
    expect(docCalls.find((c) => c.method === "not")?.args).toEqual(["expires_at", "is", null]);
  });

  it("a failed count leaves its step undone instead of throwing", async () => {
    queued.length = 0;
    queued.push(
      { count: null, error: { message: "boom" } },
      { count: null, error: { message: "boom" } },
      { count: null, error: { message: "boom" } },
    );
    const p = await getSetupProgress(op());
    expect(p.itemCount).toBe(0);
    expect(doneKeys(p.steps)).toEqual([]);
  });

  it("reports dismissal so the dashboard can stop asking", async () => {
    const p = await getSetupProgress(op({ setupDismissedAt: "2026-08-13T00:00:00.000Z" }));
    expect(p.dismissed).toBe(true);
  });
});
