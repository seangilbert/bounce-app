import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeSupabaseMock, type QueuedResponse } from "@/test/supabase-mock";
import { createAdminClient } from "@/utils/supabase/admin";
import { applyPromo, resolveBookingDiscount } from "./repo";

vi.mock("@/utils/supabase/admin", () => ({ createAdminClient: vi.fn() }));

/** Point createAdminClient at a mock whose queries return `responses` in order. */
function withDb(responses: QueuedResponse[]) {
  vi.mocked(createAdminClient).mockReturnValue(makeSupabaseMock(responses) as never);
}

// A raw `promos` row (snake_case, as the DB returns it).
const row = (over: Record<string, unknown> = {}) => ({
  id: "p1",
  operator_id: "op1",
  code: "SAVE10",
  kind: "percent",
  value: 10,
  trigger: "code",
  weekdays: null,
  active: true,
  starts_on: null,
  ends_on: null,
  min_subtotal_cents: 0,
  usage_limit: null,
  used_count: 0,
  created_at: "2026-01-01",
  ...over,
});

beforeEach(() => vi.clearAllMocks());

describe("applyPromo", () => {
  it("rejects an empty code without touching the DB", async () => {
    const r = await applyPromo("op1", "   ", 10000, "2026-07-06");
    expect(r).toEqual({ ok: false, reason: "Enter a code.", discountCents: 0 });
    expect(createAdminClient).not.toHaveBeenCalled();
  });

  it("rejects an unknown code", async () => {
    withDb([{ data: null }]);
    const r = await applyPromo("op1", "NOPE", 10000, "2026-07-06");
    expect(r).toMatchObject({ ok: false, reason: "That code isn't valid." });
  });

  it("rejects an inactive code", async () => {
    withDb([{ data: row({ active: false }) }]);
    const r = await applyPromo("op1", "SAVE10", 10000, "2026-07-06");
    expect(r.ok).toBe(false);
  });

  it("rejects a code that hasn't started yet", async () => {
    withDb([{ data: row({ starts_on: "2026-08-01" }) }]);
    const r = await applyPromo("op1", "SAVE10", 10000, "2026-07-06");
    expect(r).toMatchObject({ ok: false, reason: "This code isn't active yet." });
  });

  it("rejects an expired code", async () => {
    withDb([{ data: row({ ends_on: "2026-06-01" }) }]);
    const r = await applyPromo("op1", "SAVE10", 10000, "2026-07-06");
    expect(r).toMatchObject({ ok: false, reason: "This code has expired." });
  });

  it("rejects a fully-redeemed code", async () => {
    withDb([{ data: row({ usage_limit: 5, used_count: 5 }) }]);
    const r = await applyPromo("op1", "SAVE10", 10000, "2026-07-06");
    expect(r).toMatchObject({ ok: false, reason: "This code has been fully redeemed." });
  });

  it("rejects when below the minimum subtotal", async () => {
    withDb([{ data: row({ min_subtotal_cents: 20000 }) }]);
    const r = await applyPromo("op1", "SAVE10", 10000, "2026-07-06");
    expect(r.ok).toBe(false);
    expect(r.reason).toContain("$200");
  });

  it("applies a valid percent code", async () => {
    withDb([{ data: row({ kind: "percent", value: 10 }) }]);
    const r = await applyPromo("op1", "SAVE10", 10000, "2026-07-06");
    expect(r).toMatchObject({ ok: true, discountCents: 1000, promoId: "p1", code: "SAVE10" });
  });

  it("rejects a valid code that computes to a zero discount", async () => {
    withDb([{ data: row({ kind: "fixed", value: 0 }) }]);
    const r = await applyPromo("op1", "SAVE10", 10000, "2026-07-06");
    expect(r).toMatchObject({ ok: false, reason: "This code doesn't apply here." });
  });
});

describe("resolveBookingDiscount — no stacking, take the largest", () => {
  // 2026-07-06 is a Monday (UTC weekday 1).
  const base = { subtotalCents: 10000, startDate: "2026-07-06", customerHasPrior: false, today: "2026-07-06" };

  it("applies a matching weekday auto-promo when no code is given", async () => {
    // Only the auto-promo list query runs (no code → applyPromo skipped).
    withDb([{ data: [row({ id: "w1", trigger: "weekday", kind: "percent", value: 20, weekdays: [1] })] }]);
    const r = await resolveBookingDiscount("op1", base);
    expect(r).toMatchObject({ discountCents: 2000, appliedKind: "weekday", promoId: "w1" });
  });

  it("ignores a weekday promo that doesn't match the start day", async () => {
    withDb([{ data: [row({ trigger: "weekday", value: 20, weekdays: [0] })] }]); // Sundays only
    const r = await resolveBookingDiscount("op1", base);
    expect(r).toMatchObject({ discountCents: 0, appliedKind: null });
  });

  it("keeps the larger of a valid code vs an auto-promo (auto wins)", async () => {
    withDb([
      { data: row({ id: "c1", code: "SAVE10", kind: "percent", value: 10 }) }, // code lookup: 10%
      { data: [row({ id: "w1", trigger: "weekday", kind: "percent", value: 25, weekdays: [1] })] }, // auto: 25%
    ]);
    const r = await resolveBookingDiscount("op1", { ...base, code: "SAVE10" });
    expect(r).toMatchObject({ discountCents: 2500, appliedKind: "weekday" });
    expect(r.codeReason).toBeUndefined(); // valid code that merely lost → no error surfaced
  });

  it("keeps the larger of a valid code vs an auto-promo (code wins)", async () => {
    withDb([
      { data: row({ id: "c1", code: "BIG50", kind: "percent", value: 50 }) },
      { data: [row({ trigger: "weekday", kind: "percent", value: 10, weekdays: [1] })] },
    ]);
    const r = await resolveBookingDiscount("op1", { ...base, code: "BIG50" });
    expect(r).toMatchObject({ discountCents: 5000, appliedKind: "code", code: "BIG50" });
  });

  it("surfaces the code error when the code was invalid but an auto-promo applies", async () => {
    withDb([
      { data: null }, // code lookup: not found
      { data: [row({ trigger: "weekday", kind: "percent", value: 15, weekdays: [1] })] },
    ]);
    const r = await resolveBookingDiscount("op1", { ...base, code: "NOPE" });
    expect(r).toMatchObject({ discountCents: 1500, appliedKind: "weekday" });
    expect(r.codeReason).toBe("That code isn't valid.");
  });

  it("applies a repeat-customer auto-promo only when the customer has priors", async () => {
    withDb([{ data: [row({ id: "r1", trigger: "repeat", kind: "fixed", value: 500 })] }]);
    const no = await resolveBookingDiscount("op1", base);
    expect(no.discountCents).toBe(0);

    withDb([{ data: [row({ id: "r1", trigger: "repeat", kind: "fixed", value: 500 })] }]);
    const yes = await resolveBookingDiscount("op1", { ...base, customerHasPrior: true });
    expect(yes).toMatchObject({ discountCents: 500, appliedKind: "repeat" });
  });

  it("returns a null discount when nothing applies", async () => {
    withDb([{ data: [] }]);
    const r = await resolveBookingDiscount("op1", base);
    expect(r).toMatchObject({ discountCents: 0, promoId: null, code: null, appliedKind: null });
  });
});
