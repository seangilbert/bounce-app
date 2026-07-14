import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeSupabaseMock, type QueuedResponse } from "@/test/supabase-mock";

const { adminMock } = vi.hoisted(() => ({ adminMock: vi.fn() }));
vi.mock("@/utils/supabase/admin", () => ({ createAdminClient: adminMock }));

import { getResumableConversation } from "./conversations";

const ACCOUNT = "acct-1";
const SLUG = "bounce-usa";

const mockDb = (rows: QueuedResponse[]) => {
  const db = makeSupabaseMock(rows);
  adminMock.mockReturnValue(db);
  return db;
};

const m = (id: string, sender: string, created_at: string) => ({
  id,
  sender,
  body: `msg ${id}`,
  created_at,
});

beforeEach(() => adminMock.mockReset());

describe("getResumableConversation — scoping", () => {
  it("requires the thread to belong to BOTH this account and this operator", async () => {
    const db = mockDb([
      { data: { id: "inq-1", created_at: "2026-07-01T00:00:00Z", inquiry_messages: [m("m1", "customer", "2026-07-01T00:00:00Z")] } },
    ]);

    await getResumableConversation(ACCOUNT, SLUG);

    // Drop the account filter and any renter could read anyone's conversation.
    expect(db.builder.eq).toHaveBeenCalledWith("customers.account_id", ACCOUNT);
    // Drop the operator filter and one storefront would surface a thread the
    // customer had with a different operator.
    expect(db.builder.eq).toHaveBeenCalledWith("operators.slug", SLUG);
  });

  it("ignores dismissed threads and anything past the cutoff", async () => {
    const db = mockDb([{ data: null }]);
    await getResumableConversation(ACCOUNT, SLUG);
    expect(db.builder.neq).toHaveBeenCalledWith("status", "dismissed");
    expect(db.builder.gte).toHaveBeenCalledWith("created_at", expect.any(String));
  });

  it("takes one round-trip, not three", async () => {
    // The messages are embedded in the same query. Regression guard: this was
    // 3 sequential calls (~360ms) before, and latency here is round-trip-bound.
    const db = mockDb([
      { data: { id: "inq-1", created_at: "2026-07-01T00:00:00Z", inquiry_messages: [m("m1", "customer", "2026-07-01T00:00:00Z")] } },
    ]);
    await getResumableConversation(ACCOUNT, SLUG);
    expect(db.from).toHaveBeenCalledTimes(1);
  });
});

describe("getResumableConversation — result", () => {
  it("returns the thread, dated by its LAST message", async () => {
    mockDb([
      {
        data: {
          id: "inq-1",
          created_at: "2026-07-01T00:00:00Z",
          inquiry_messages: [
            m("m1", "customer", "2026-07-01T00:00:00Z"),
            m("m2", "ai", "2026-07-02T00:00:00Z"),
          ],
        },
      },
    ]);

    const res = await getResumableConversation(ACCOUNT, SLUG);

    expect(res?.inquiryId).toBe("inq-1");
    expect(res?.messages).toHaveLength(2);
    // The banner reads "from <date>", so it must be the latest message — not
    // the inquiry's creation date.
    expect(res?.updatedAt).toBe("2026-07-02T00:00:00Z");
  });

  it("sorts embedded messages chronologically", async () => {
    // Embedded rows come back in no guaranteed order.
    mockDb([
      {
        data: {
          id: "inq-1",
          created_at: "2026-07-01T00:00:00Z",
          inquiry_messages: [
            m("m3", "customer", "2026-07-03T00:00:00Z"),
            m("m1", "customer", "2026-07-01T00:00:00Z"),
            m("m2", "ai", "2026-07-02T00:00:00Z"),
          ],
        },
      },
    ]);
    const res = await getResumableConversation(ACCOUNT, SLUG);
    expect(res?.messages.map((x) => x.id)).toEqual(["m1", "m2", "m3"]);
  });

  it("breaks same-timestamp ties customer → ai, so the answer never precedes the question", async () => {
    // The 0021 backfill seeded both at the inquiry's created_at.
    mockDb([
      {
        data: {
          id: "inq-1",
          created_at: "2026-07-01T00:00:00Z",
          inquiry_messages: [
            m("ai-1", "ai", "2026-07-01T00:00:00Z"),
            m("cust-1", "customer", "2026-07-01T00:00:00Z"),
          ],
        },
      },
    ]);
    const res = await getResumableConversation(ACCOUNT, SLUG);
    expect(res?.messages.map((x) => x.id)).toEqual(["cust-1", "ai-1"]);
  });

  it("returns null when there's no thread", async () => {
    mockDb([{ data: null }]);
    expect(await getResumableConversation(ACCOUNT, SLUG)).toBeNull();
  });

  it("returns null for an inquiry whose thread is empty — nothing to resume", async () => {
    mockDb([{ data: { id: "inq-1", created_at: "2026-07-01T00:00:00Z", inquiry_messages: [] } }]);
    expect(await getResumableConversation(ACCOUNT, SLUG)).toBeNull();
  });
});
