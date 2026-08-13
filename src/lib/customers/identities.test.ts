import { describe, it, expect, vi, beforeEach } from "vitest";

const { upsert, select } = vi.hoisted(() => ({ upsert: vi.fn(), select: vi.fn() }));

vi.mock("@/utils/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (table: string) => ({
      upsert: (payload: unknown, opts: unknown) => {
        upsert(table, payload, opts);
        return Promise.resolve({ error: upsertError });
      },
      select: () => {
        const b: Record<string, unknown> = {};
        for (const m of ["eq", "order", "limit"]) b[m] = () => b;
        b.then = (res: (v: unknown) => unknown) =>
          Promise.resolve({ data: select(), error: null }).then(res);
        return b;
      },
    }),
  }),
}));

let upsertError: { message: string } | null = null;

import { recordChannelIdentity, findCustomersByIdentity } from "./identities";

beforeEach(() => {
  vi.clearAllMocks();
  upsertError = null;
  select.mockReturnValue([]);
});

describe("recordChannelIdentity", () => {
  it("upserts on the (operator, channel, external_id) key, bumping last_seen_at", async () => {
    await recordChannelIdentity("op-1", "cust-1", "email", "jane@example.com");
    const [table, payload, opts] = upsert.mock.calls[0]!;
    expect(table).toBe("channel_identities");
    expect(payload).toMatchObject({
      operator_id: "op-1",
      customer_id: "cust-1",
      channel: "email",
      external_id: "jane@example.com",
    });
    expect((payload as { last_seen_at: string }).last_seen_at).toBeTruthy();
    expect(opts).toEqual({ onConflict: "operator_id,channel,external_id" });
  });

  it("never throws — an identity write must not fail the booking/inquiry flow", async () => {
    upsertError = { message: "db down" };
    await expect(recordChannelIdentity("op-1", "cust-1", "sms", "+15085551234")).resolves.toBeUndefined();
  });
});

describe("findCustomersByIdentity", () => {
  it("maps holder rows (query orders by last_seen_at desc in the impl)", async () => {
    select.mockReturnValue([
      { customer_id: "cust-2", operator_id: "op-2" },
      { customer_id: "cust-1", operator_id: "op-1" },
    ]);
    const holders = await findCustomersByIdentity("sms", "+15085551234");
    expect(holders).toEqual([
      { customerId: "cust-2", operatorId: "op-2" },
      { customerId: "cust-1", operatorId: "op-1" },
    ]);
  });

  it("empty result → empty array", async () => {
    expect(await findCustomersByIdentity("email", "nobody@example.com")).toEqual([]);
  });
});
