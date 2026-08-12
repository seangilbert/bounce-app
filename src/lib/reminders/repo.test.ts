import { describe, it, expect, vi, beforeEach } from "vitest";

const { insert, del } = vi.hoisted(() => ({ insert: vi.fn(), del: vi.fn() }));

vi.mock("@/utils/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (table: string) => ({
      insert: (payload: unknown) => {
        insert(table, payload);
        return Promise.resolve({
          error: insertError ? { code: insertError, message: `pg error ${insertError}` } : null,
        });
      },
      delete: () => ({
        eq: (k1: string, v1: unknown) => ({
          eq: (k2: string, v2: unknown) => {
            del(table, [k1, v1], [k2, v2]);
            return Promise.resolve({ error: null });
          },
        }),
      }),
    }),
  }),
}));

let insertError: string | null = null;

import { claimReminder, releaseReminder } from "./repo";

beforeEach(() => {
  vi.clearAllMocks();
  insertError = null;
});

describe("claimReminder — insert-first claim", () => {
  it("true on a fresh claim, recording booking/operator/kind", async () => {
    expect(await claimReminder("bk-1", "op-1", "balance")).toBe(true);
    expect(insert).toHaveBeenCalledWith("booking_reminders", {
      booking_id: "bk-1",
      operator_id: "op-1",
      kind: "balance",
    });
  });

  it("false on unique violation (already reminded, ever)", async () => {
    insertError = "23505";
    expect(await claimReminder("bk-1", "op-1", "balance")).toBe(false);
  });

  it("throws on any other error", async () => {
    insertError = "40001";
    await expect(claimReminder("bk-1", "op-1", "contract")).rejects.toThrow(/claimReminder failed/);
  });
});

describe("releaseReminder", () => {
  it("deletes by booking + kind so the next run retries", async () => {
    await releaseReminder("bk-1", "contract");
    expect(del).toHaveBeenCalledWith("booking_reminders", ["booking_id", "bk-1"], ["kind", "contract"]);
  });
});
