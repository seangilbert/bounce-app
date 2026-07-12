import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeSupabaseMock, type QueuedResponse } from "@/test/supabase-mock";
import { createAdminClient } from "@/utils/supabase/admin";
import { checkAvailability } from "./availability";

vi.mock("@/utils/supabase/admin", () => ({ createAdminClient: vi.fn() }));

// checkAvailability does exactly two round-trips: the item row, then the
// reserved_peak RPC. Queue them in that order.
function withDb(item: unknown, peak: unknown, itemErr?: unknown, rpcErr?: unknown) {
  const responses: QueuedResponse[] = [
    { data: item, error: itemErr },
    { data: peak, error: rpcErr },
  ];
  vi.mocked(createAdminClient).mockReturnValue(makeSupabaseMock(responses) as never);
}

const item = (over: Record<string, number> = {}) => ({
  quantity: 10,
  units_needs_cleaning: 0,
  units_damaged: 0,
  units_in_repair: 0,
  ...over,
});

beforeEach(() => vi.clearAllMocks());

describe("checkAvailability", () => {
  it("computes available = owned − reserved and ok when it covers the need", async () => {
    withDb(item({ quantity: 10 }), 3);
    const a = await checkAvailability("i1", "2026-07-06", "2026-07-08", 2);
    expect(a).toEqual({ owned: 10, reserved: 3, available: 7, ok: true });
  });

  it("subtracts out-of-service units from owned", async () => {
    withDb(item({ quantity: 10, units_needs_cleaning: 2, units_damaged: 1, units_in_repair: 1 }), 0);
    const a = await checkAvailability("i1", "2026-07-06", "2026-07-08");
    expect(a.owned).toBe(6);
    expect(a.available).toBe(6);
  });

  it("is not ok when reserved leaves fewer than needed", async () => {
    withDb(item({ quantity: 5 }), 4);
    const a = await checkAvailability("i1", "2026-07-06", "2026-07-08", 2);
    expect(a).toMatchObject({ owned: 5, reserved: 4, available: 1, ok: false });
  });

  it("treats a null peak as zero reserved", async () => {
    withDb(item({ quantity: 4 }), null);
    const a = await checkAvailability("i1", "2026-07-06", "2026-07-08");
    expect(a).toMatchObject({ reserved: 0, available: 4, ok: true });
  });

  it("can report a negative available (oversold) without crashing", async () => {
    withDb(item({ quantity: 2 }), 5);
    const a = await checkAvailability("i1", "2026-07-06", "2026-07-08", 1);
    expect(a).toMatchObject({ owned: 2, reserved: 5, available: -3, ok: false });
  });

  it("clamps owned at zero when everything is out of service", async () => {
    withDb(item({ quantity: 2, units_damaged: 5 }), 0);
    const a = await checkAvailability("i1", "2026-07-06", "2026-07-08");
    expect(a.owned).toBe(0);
  });

  it("throws when the item does not exist", async () => {
    withDb(null, 0);
    await expect(checkAvailability("missing", "2026-07-06", "2026-07-08")).rejects.toThrow(/not found/);
  });

  it("throws when the item query errors", async () => {
    withDb(null, 0, { message: "boom" });
    await expect(checkAvailability("i1", "2026-07-06", "2026-07-08")).rejects.toThrow(/boom/);
  });

  it("throws when the reserved_peak RPC errors", async () => {
    withDb(item(), null, undefined, { message: "rpc down" });
    await expect(checkAvailability("i1", "2026-07-06", "2026-07-08")).rejects.toThrow(/rpc down/);
  });
});
