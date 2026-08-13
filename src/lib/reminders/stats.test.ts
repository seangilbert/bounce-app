import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Agent activity stats: kind bucketing, month vs all-time split, and the
 * never-500 error posture. Queries are fed via a queued thenable stub
 * (booking_reminders first, document_reminders second — call order).
 */

const { queuedQueryResults } = vi.hoisted(() => ({
  queuedQueryResults: [] as { data: unknown[] | null; error: { message: string } | null }[],
}));

vi.mock("@/utils/supabase/server", () => ({
  createClient: () => ({
    from: () => {
      const result = queuedQueryResults.shift() ?? { data: [], error: null };
      const b: Record<string, unknown> = {};
      for (const m of ["select", "eq"]) b[m] = () => b;
      b.then = (res: (v: unknown) => unknown) => Promise.resolve(result).then(res);
      return b;
    },
  }),
}));

import { getAgentStats } from "./stats";

const NOW = new Date().toISOString(); // inside the current UTC month by definition
const OLD = "2020-01-05T12:00:00.000Z";

function queue(bookings: unknown[], docs: unknown[]) {
  queuedQueryResults.length = 0;
  queuedQueryResults.push({ data: bookings, error: null }, { data: docs, error: null });
}

beforeEach(() => {
  queue([], []);
});

describe("getAgentStats", () => {
  it("buckets booking reminders by kind and splits month vs all-time", async () => {
    queue(
      [
        { kind: "balance", sent_at: NOW },
        { kind: "balance", sent_at: OLD },
        { kind: "quote", sent_at: NOW },
        { kind: "contract", sent_at: OLD },
      ],
      [{ sent_at: NOW }, { sent_at: OLD }],
    );
    const s = await getAgentStats("op-1");
    expect(s.balance).toEqual({ month: 1, total: 2 });
    expect(s.quote).toEqual({ month: 1, total: 1 });
    expect(s.contract).toEqual({ month: 0, total: 1 });
    expect(s.docExpiry).toEqual({ month: 1, total: 2 });
  });

  it("returns zeros for an operator with no activity", async () => {
    const s = await getAgentStats("op-1");
    expect(s).toEqual({
      balance: { month: 0, total: 0 },
      contract: { month: 0, total: 0 },
      quote: { month: 0, total: 0 },
      docExpiry: { month: 0, total: 0 },
    });
  });

  it("an unknown future kind is ignored, not a crash", async () => {
    queue([{ kind: "someday", sent_at: NOW }], []);
    const s = await getAgentStats("op-1");
    expect(s.balance.total).toBe(0);
  });

  it("query errors log and return zeros — the page never 500s over stats", async () => {
    queuedQueryResults.length = 0;
    queuedQueryResults.push(
      { data: null, error: { message: "boom" } },
      { data: null, error: { message: "boom" } },
    );
    const s = await getAgentStats("op-1");
    expect(s.balance).toEqual({ month: 0, total: 0 });
    expect(s.docExpiry).toEqual({ month: 0, total: 0 });
  });
});
