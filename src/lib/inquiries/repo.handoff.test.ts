import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Handoff state transitions (inbox-plan Phase 0): assert the exact payloads the
 * repo writes so lifecycle `status` and handoff `owner` can never drift apart.
 * The supabase stub is a self-chaining builder that records every from() call.
 */

interface Captured {
  table: string;
  op: string;
  payload?: unknown;
  filters: [string, unknown][];
}

const { adminCalls, userCalls, upsertCustomer, results } = vi.hoisted(() => ({
  adminCalls: [] as Captured[],
  userCalls: [] as Captured[],
  upsertCustomer: vi.fn(),
  // keyed `${table}.${op}` → what maybeSingle()/single() resolves to
  results: new Map<string, unknown>(),
}));

function makeClient(calls: Captured[]) {
  return {
    from(table: string) {
      const call: Captured = { table, op: "select", filters: [] };
      calls.push(call);
      const done = () =>
        results.get(`${call.table}.${call.op}`) ?? { data: { id: "row-1" }, error: null };
      const b: Record<string, unknown> = {};
      const chain = (name: string, fn?: (...a: unknown[]) => void) => {
        b[name] = (...a: unknown[]) => {
          fn?.(...a);
          return b;
        };
      };
      chain("insert", (p) => {
        call.op = "insert";
        call.payload = p;
      });
      chain("update", (p) => {
        call.op = "update";
        call.payload = p;
      });
      chain("select");
      chain("eq", (k, v) => call.filters.push([k as string, v]));
      chain("neq");
      chain("order");
      chain("limit");
      chain("in");
      b.maybeSingle = () => Promise.resolve(done());
      b.single = () => Promise.resolve(done());
      // Awaiting the builder directly (e.g. bare .update().eq()) resolves too.
      b.then = (res: (v: unknown) => unknown) => Promise.resolve({ data: null, error: null }).then(res);
      return b;
    },
  };
}

vi.mock("@/utils/supabase/admin", () => ({ createAdminClient: () => makeClient(adminCalls) }));
vi.mock("@/utils/supabase/server", () => ({ createClient: () => makeClient(userCalls) }));
vi.mock("@/lib/customers/repo", () => ({ upsertCustomer }));

import {
  createInquiry,
  replyToInquiry,
  markInquiryNeedsHuman,
  setInquiryOwnerAsOperator,
  recordCustomerInbound,
} from "./repo";

beforeEach(() => {
  vi.clearAllMocks();
  adminCalls.length = 0;
  userCalls.length = 0;
  results.clear();
  upsertCustomer.mockResolvedValue("cust-1");
});

const inquiryInput = (auto: boolean) => ({
  operatorId: "op-1",
  bookingId: null,
  customerName: "Jane",
  customerEmail: "jane@example.com",
  channel: "website",
  inboundMessage: "Need a bounce house",
  startDate: "2030-01-01",
  endDate: "2030-01-01",
  auto,
  confidence: "high" as const,
  aiSummary: "Here's a great fit!",
  escalationReasons: [],
  unmatchedRequests: [],
  quote: null,
});

describe("createInquiry — owner alongside status", () => {
  it("auto-answered → owner 'ai', with last_customer_at stamped", async () => {
    results.set("inquiries.insert", { data: { id: "inq-1" }, error: null });
    await createInquiry(inquiryInput(true));
    const ins = adminCalls.find((c) => c.table === "inquiries" && c.op === "insert")!;
    expect(ins.payload).toMatchObject({ status: "auto", owner: "ai" });
    expect((ins.payload as { last_customer_at: string }).last_customer_at).toBeTruthy();
  });

  it("escalated → owner 'needs_human'", async () => {
    results.set("inquiries.insert", { data: { id: "inq-1" }, error: null });
    await createInquiry(inquiryInput(false));
    const ins = adminCalls.find((c) => c.table === "inquiries" && c.op === "insert")!;
    expect(ins.payload).toMatchObject({ status: "needs_review", owner: "needs_human" });
  });

  it("seeds thread messages with channel + direction", async () => {
    results.set("inquiries.insert", { data: { id: "inq-1" }, error: null });
    await createInquiry(inquiryInput(true));
    const seed = adminCalls.find((c) => c.table === "inquiry_messages" && c.op === "insert")!;
    expect(seed.payload).toEqual([
      expect.objectContaining({ sender: "customer", channel: "website", direction: "inbound" }),
      expect.objectContaining({ sender: "ai", channel: "website", direction: "outbound" }),
    ]);
  });
});

describe("replyToInquiry — a reply IS a takeover", () => {
  it("flips owner to human and stamps last_human_at in the same update", async () => {
    results.set("inquiries.update", {
      data: {
        customer_email: "jane@example.com",
        customer_name: "Jane",
        customer_phone: null,
        channel: "sms",
        inbound_message: "hi",
      },
      error: null,
    });
    await replyToInquiry("op-1", "inq-1", "On it!");
    const upd = userCalls.find((c) => c.table === "inquiries" && c.op === "update")!;
    expect(upd.payload).toMatchObject({ status: "replied", owner: "human" });
    expect((upd.payload as { last_human_at: string }).last_human_at).toBeTruthy();
    // The thread append carries the delivery channel, outbound.
    const append = adminCalls.find((c) => c.table === "inquiry_messages" && c.op === "insert")!;
    expect(append.payload).toMatchObject({ sender: "operator", channel: "sms", direction: "outbound" });
  });
});

describe("markInquiryNeedsHuman — centralized escalation", () => {
  it("sets lifecycle and handoff state together", async () => {
    await markInquiryNeedsHuman("inq-1");
    const upd = adminCalls.find((c) => c.table === "inquiries" && c.op === "update")!;
    expect(upd.payload).toEqual({ status: "needs_review", owner: "needs_human" });
  });
});

describe("setInquiryOwnerAsOperator", () => {
  it("take over stamps last_human_at", async () => {
    await setInquiryOwnerAsOperator("op-1", "inq-1", "human");
    const upd = userCalls.find((c) => c.table === "inquiries" && c.op === "update")!;
    expect(upd.payload).toMatchObject({ owner: "human" });
    expect((upd.payload as { last_human_at: string }).last_human_at).toBeTruthy();
    expect(upd.filters).toContainEqual(["operator_id", "op-1"]);
  });

  it("hand back only changes owner (no fake human activity)", async () => {
    await setInquiryOwnerAsOperator("op-1", "inq-1", "ai");
    const upd = userCalls.find((c) => c.table === "inquiries" && c.op === "update")!;
    expect(upd.payload).toEqual({ owner: "ai" });
  });
});

describe("recordCustomerInbound", () => {
  it("appends the message and touches last_customer_at", async () => {
    await recordCustomerInbound("inq-1", "still there?", "sms");
    const append = adminCalls.find((c) => c.table === "inquiry_messages" && c.op === "insert")!;
    expect(append.payload).toMatchObject({
      sender: "customer",
      body: "still there?",
      channel: "sms",
      direction: "inbound",
    });
    const touch = adminCalls.find((c) => c.table === "inquiries" && c.op === "update")!;
    expect((touch.payload as { last_customer_at: string }).last_customer_at).toBeTruthy();
  });
});
