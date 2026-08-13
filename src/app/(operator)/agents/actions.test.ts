import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * The agent toggle's security branch: admin-only, and the Solo+ plan gate on
 * the customer-facing agents — never trusted from the client. First server-
 * action test in the repo; the write is a queued supabase stub like the
 * route tests.
 */

const { requireAdmin, update, eq } = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  update: vi.fn(),
  eq: vi.fn(),
}));

vi.mock("@/lib/operator/session", () => ({ requireAdmin }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/utils/supabase/server", () => ({
  createClient: () => ({
    from: (table: string) => ({
      update: (patch: unknown) => {
        update(table, patch);
        return {
          eq: (k: string, v: unknown) => {
            eq(k, v);
            return Promise.resolve({ error: null });
          },
        };
      },
    }),
  }),
}));

import { setAgentToggleAction } from "./actions";

const membership = (operator: Record<string, unknown>) => ({
  ok: true,
  membership: { operator: { id: "op-1", ...operator } },
});

const SOLO = { plan: "solo", subscriptionStatus: "active", billingExempt: false };
const FREE = { plan: "free", subscriptionStatus: null, billingExempt: false };

beforeEach(() => {
  vi.clearAllMocks();
  requireAdmin.mockResolvedValue(membership(SOLO));
});

describe("setAgentToggleAction", () => {
  it("admin on Solo can flip a follow-up agent — writes the right column", async () => {
    const res = await setAgentToggleAction({ key: "remindQuote", enabled: true });
    expect(res).toEqual({ ok: true });
    expect(update).toHaveBeenCalledWith("operators", { remind_quote: true });
    expect(eq).toHaveBeenCalledWith("id", "op-1");
  });

  it("free plan: follow-up agents are rejected server-side", async () => {
    requireAdmin.mockResolvedValue(membership(FREE));
    const res = await setAgentToggleAction({ key: "remindBalance", enabled: true });
    expect(res).toEqual({
      ok: false,
      error: "Automated follow-ups are available on the Solo plan and up.",
    });
    expect(update).not.toHaveBeenCalled();
  });

  it("free plan: Compliance Watch passes — operator-facing, never gated", async () => {
    requireAdmin.mockResolvedValue(membership(FREE));
    const res = await setAgentToggleAction({ key: "notifyDocExpiry", enabled: false });
    expect(res).toEqual({ ok: true });
    expect(update).toHaveBeenCalledWith("operators", { notify_doc_expiry: false });
  });

  it("non-admin is rejected before any parse or write", async () => {
    requireAdmin.mockResolvedValue({ ok: false, error: "Only admins can do that." });
    const res = await setAgentToggleAction({ key: "remindBalance", enabled: true });
    expect(res).toEqual({ ok: false, error: "Only admins can do that." });
    expect(update).not.toHaveBeenCalled();
  });

  it("rejects an unknown toggle key", async () => {
    const res = await setAgentToggleAction({ key: "deleteEverything", enabled: true });
    expect(res.ok).toBe(false);
    expect(update).not.toHaveBeenCalled();
  });
});
