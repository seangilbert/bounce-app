import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeSupabaseMock, type QueuedResponse } from "@/test/supabase-mock";

const { adminMock, listMessagesByInquiry } = vi.hoisted(() => ({
  adminMock: vi.fn(),
  listMessagesByInquiry: vi.fn(),
}));
vi.mock("@/utils/supabase/admin", () => ({ createAdminClient: adminMock }));
vi.mock("@/lib/inquiries/repo", () => ({ listMessagesByInquiry }));

import { getResumableConversation } from "./conversations";

const ACCOUNT = "acct-1";
const OPERATOR = "op-1";

const mockDb = (rows: QueuedResponse[]) => {
  const db = makeSupabaseMock(rows);
  adminMock.mockReturnValue(db);
  return db;
};

const msg = { id: "m1", sender: "customer" as const, body: "hi", createdAt: "2026-07-01T00:00:00Z" };

beforeEach(() => {
  adminMock.mockReset();
  listMessagesByInquiry.mockReset();
});

describe("getResumableConversation — scoping", () => {
  it("returns null when the account owns no customer record with this operator", async () => {
    const db = mockDb([{ data: [] }]);

    expect(await getResumableConversation(ACCOUNT, OPERATOR)).toBeNull();
    // Must not go looking for inquiries at all — there's no one to scope to.
    expect(db.from).toHaveBeenCalledTimes(1);
  });

  it("scopes the inquiry lookup by BOTH the owned customer ids and the operator", async () => {
    const db = mockDb([{ data: [{ id: "cust-a" }] }, { data: { id: "inq-1" } }]);
    listMessagesByInquiry.mockResolvedValue(new Map([["inq-1", [msg]]]));

    await getResumableConversation(ACCOUNT, OPERATOR);

    // Without the customer scope, any renter could resume any thread. Without
    // the operator scope, one operator's storefront would surface a
    // conversation the customer had with a different operator.
    expect(db.builder.in).toHaveBeenCalledWith("customer_id", ["cust-a"]);
    expect(db.builder.eq).toHaveBeenCalledWith("operator_id", OPERATOR);
  });

  it("ignores dismissed threads and anything older than the cutoff", async () => {
    const db = mockDb([{ data: [{ id: "cust-a" }] }, { data: null }]);

    await getResumableConversation(ACCOUNT, OPERATOR);

    expect(db.builder.neq).toHaveBeenCalledWith("status", "dismissed");
    expect(db.builder.gte).toHaveBeenCalledWith("created_at", expect.any(String));
  });
});

describe("getResumableConversation — result", () => {
  it("returns the thread with its last-message timestamp", async () => {
    mockDb([{ data: [{ id: "cust-a" }] }, { data: { id: "inq-1" } }]);
    const later = { ...msg, id: "m2", sender: "ai" as const, createdAt: "2026-07-02T00:00:00Z" };
    listMessagesByInquiry.mockResolvedValue(new Map([["inq-1", [msg, later]]]));

    const res = await getResumableConversation(ACCOUNT, OPERATOR);

    expect(res?.inquiryId).toBe("inq-1");
    expect(res?.messages).toHaveLength(2);
    // The banner says "from <date>", so it must be the latest message, not the
    // inquiry's creation date.
    expect(res?.updatedAt).toBe("2026-07-02T00:00:00Z");
  });

  it("returns null for an inquiry whose thread is somehow empty", async () => {
    mockDb([{ data: [{ id: "cust-a" }] }, { data: { id: "inq-1" } }]);
    listMessagesByInquiry.mockResolvedValue(new Map());
    // Nothing to resume — better to offer nothing than an empty chat.
    expect(await getResumableConversation(ACCOUNT, OPERATOR)).toBeNull();
  });
});
