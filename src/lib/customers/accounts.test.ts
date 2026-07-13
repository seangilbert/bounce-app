import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeSupabaseMock } from "@/test/supabase-mock";

const { adminMock } = vi.hoisted(() => ({ adminMock: vi.fn() }));
vi.mock("@/utils/supabase/admin", () => ({ createAdminClient: adminMock }));

import { normalizeEmail, claimCustomerRecords, hasCustomerRecords } from "./accounts";

beforeEach(() => adminMock.mockReset());

describe("normalizeEmail", () => {
  it("lowercases and trims — email is identity here, so it must compare stably", () => {
    expect(normalizeEmail("  Jane@Example.COM ")).toBe("jane@example.com");
  });
});

describe("hasCustomerRecords", () => {
  it("is true when some operator has recorded this person", async () => {
    const db = makeSupabaseMock([{ data: [{ id: "cust-a" }] }]);
    adminMock.mockReturnValue(db);
    expect(await hasCustomerRecords("Jane@Example.com")).toBe(true);
    expect(db.builder.eq).toHaveBeenCalledWith("email", "jane@example.com");
  });

  it("is false when nobody has", async () => {
    adminMock.mockReturnValue(makeSupabaseMock([{ data: [] }]));
    expect(await hasCustomerRecords("stranger@example.com")).toBe(false);
  });
});

describe("claimCustomerRecords", () => {
  it("claims only rows matching the verified email, and only unclaimed ones", async () => {
    const db = makeSupabaseMock([{ data: [{ id: "cust-a" }, { id: "cust-b" }] }]);
    adminMock.mockReturnValue(db);

    const claimed = await claimCustomerRecords("acct-1", "Jane@Example.com");

    expect(claimed).toBe(2);
    expect(db.builder.update).toHaveBeenCalledWith({ account_id: "acct-1" });
    // Matched on the normalized email — `customers.email` is stored lowercased,
    // so a raw comparison would silently claim nothing.
    expect(db.builder.eq).toHaveBeenCalledWith("email", "jane@example.com");
    // `.is("account_id", null)` is the safety catch: without it, re-running this
    // would re-point rows ALREADY owned by another account at this one — one
    // person's rental history silently reassigned to someone else.
    expect(db.builder.is).toHaveBeenCalledWith("account_id", null);
  });

  it("is idempotent — a second login claims nothing new", async () => {
    adminMock.mockReturnValue(makeSupabaseMock([{ data: [] }]));
    expect(await claimCustomerRecords("acct-1", "jane@example.com")).toBe(0);
  });

  it("reports zero rather than throwing when the update fails", async () => {
    adminMock.mockReturnValue(makeSupabaseMock([{ data: null, error: { message: "boom" } }]));
    expect(await claimCustomerRecords("acct-1", "jane@example.com")).toBe(0);
  });
});
