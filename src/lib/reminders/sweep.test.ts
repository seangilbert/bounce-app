import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * The follow-up sweep's decision table: opt-in gates, date windows, esign
 * gates, claim-before-send, release-on-failure, AI fallback, caps. Candidate
 * queries are fed via a queued admin-client mock; email builders run for real
 * (from @/lib/email) with only the transport mocked.
 */

const {
  queuedQueryResults,
  getOperatorById,
  getBooking,
  getOrderByBookingId,
  remind,
  operatorToday,
  sendEmail,
  draftReminderIntro,
  claimReminder,
  releaseReminder,
} = vi.hoisted(() => ({
  queuedQueryResults: [] as { data: unknown[]; error: null }[],
  getOperatorById: vi.fn(),
  getBooking: vi.fn(),
  getOrderByBookingId: vi.fn(),
  remind: vi.fn(),
  operatorToday: vi.fn(),
  sendEmail: vi.fn(),
  draftReminderIntro: vi.fn(),
  claimReminder: vi.fn(),
  releaseReminder: vi.fn(),
}));

// Thenable self-chaining query stub; loadCandidates awaits two of these
// (balance first, contract second) — results are dequeued in call order.
vi.mock("@/utils/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => {
      const result = queuedQueryResults.shift() ?? { data: [], error: null };
      const b: Record<string, unknown> = {};
      for (const m of ["select", "in", "eq", "gte", "lte", "lt"]) b[m] = () => b;
      b.then = (res: (v: unknown) => unknown) => Promise.resolve(result).then(res);
      return b;
    },
  }),
}));
vi.mock("@/lib/inventory/repo", () => ({ getOperatorById }));
vi.mock("@/lib/bookings/repo", () => ({ getBooking }));
vi.mock("@/lib/orders/repo", () => ({ getOrderByBookingId }));
vi.mock("@/lib/esign", () => ({ getESignatureProvider: () => ({ remind }) }));
vi.mock("@/lib/operator/time", () => ({ operatorToday }));
vi.mock("@/lib/email", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/email")>()),
  sendEmail,
}));
vi.mock("@/lib/llm/assistant", () => ({ draftReminderIntro }));
vi.mock("./repo", () => ({ claimReminder, releaseReminder }));

import { runReminderSweep } from "./sweep";

const TODAY = "2030-06-01";
const OLD = "2020-01-01T00:00:00Z"; // way past the 24h freshness gate

const OPERATOR = {
  id: "op-1",
  name: "Bounce USA",
  timezone: "America/New_York",
  contactEmail: "owner@example.com",
  remindBalance: true,
  remindContract: true,
  cancellationPolicy: null,
  damagePolicy: null,
};

const balanceRow = (over: Record<string, unknown> = {}) => ({
  id: "bk-1",
  operator_id: "op-1",
  status: "paid",
  start_date: "2030-06-02",
  end_date: "2030-06-02",
  total: 30000,
  deposit: 10000,
  customer_email: "jane@example.com",
  customer_name: "Jane Doe",
  created_at: OLD,
  updated_at: OLD,
  ...over,
});

const contractRow = (over: Record<string, unknown> = {}) => ({
  ...balanceRow({ id: "bk-2", status: "contracted", ...over }),
});

const BOOKING = {
  id: "bk-1",
  startDate: "2030-06-02",
  endDate: "2030-06-02",
  total: 30000,
  deposit: 10000,
  subtotal: 30000,
  deliveryFee: 0,
  taxAmount: 0,
  discount: 0,
  promoCode: null,
  items: [{ itemId: "i1", name: "Rainbow Castle", quantity: 1, lineTotal: 30000 }],
};

function queue(balance: unknown[], contract: unknown[]) {
  queuedQueryResults.length = 0;
  queuedQueryResults.push({ data: balance, error: null }, { data: contract, error: null });
}

beforeEach(() => {
  vi.clearAllMocks();
  queue([], []);
  getOperatorById.mockResolvedValue(OPERATOR);
  operatorToday.mockReturnValue(TODAY);
  getBooking.mockResolvedValue(BOOKING);
  getOrderByBookingId.mockResolvedValue({ esignDocumentId: "doc-1", esignStatus: "sent" });
  remind.mockResolvedValue(undefined);
  sendEmail.mockResolvedValue({ ok: true });
  draftReminderIntro.mockResolvedValue("Hi Jane — quick reminder about your event!");
  claimReminder.mockResolvedValue(true);
});

describe("balance lane", () => {
  it("sends a balance reminder with the pay link, claiming first", async () => {
    queue([balanceRow()], []);
    const res = await runReminderSweep();
    expect(res.balanceSent).toBe(1);
    expect(claimReminder).toHaveBeenCalledWith("bk-1", "op-1", "balance");
    const email = sendEmail.mock.calls[0]![0];
    expect(email.to).toBe("jane@example.com");
    expect(email.subject).toBe("Balance due — Bounce USA");
    expect(email.fromName).toBe("Bounce USA");
    expect(email.html).toContain("/pay/bk-1?type=balance");
    expect(email.html).toContain("$200"); // 30000-10000 rendered from the DB
    // Claim happened before send.
    expect(claimReminder.mock.invocationCallOrder[0]).toBeLessThan(sendEmail.mock.invocationCallOrder[0]!);
  });

  it("skips: toggle off / no email / fresh booking / zero balance / outside window / past event", async () => {
    queue(
      [
        balanceRow({ id: "b1" }),
        balanceRow({ id: "b2", customer_email: null }),
        balanceRow({ id: "b3", created_at: new Date().toISOString() }),
        balanceRow({ id: "b4", deposit: 30000 }),
        balanceRow({ id: "b5", start_date: "2030-06-09" }),
        balanceRow({ id: "b6", start_date: "2030-05-30" }),
      ],
      [],
    );
    getOperatorById.mockResolvedValue({ ...OPERATOR, remindBalance: false });
    const res = await runReminderSweep();
    expect(res.balanceSent).toBe(0);
    expect(res.skipped).toBe(6);
    expect(claimReminder).not.toHaveBeenCalled();
  });

  it("event exactly today and today+3 are inside the window", async () => {
    queue([balanceRow({ id: "b1", start_date: TODAY }), balanceRow({ id: "b2", start_date: "2030-06-04" })], []);
    const res = await runReminderSweep();
    expect(res.balanceSent).toBe(2);
  });

  it("null deposit means the full total is due", async () => {
    queue([balanceRow({ deposit: null })], []);
    const res = await runReminderSweep();
    expect(res.balanceSent).toBe(1);
    expect(sendEmail.mock.calls[0]![0].html).toContain("$300");
  });

  it("already claimed → skipped, nothing sent", async () => {
    queue([balanceRow()], []);
    claimReminder.mockResolvedValue(false);
    const res = await runReminderSweep();
    expect(res.skipped).toBe(1);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("send failure releases the claim and counts failed", async () => {
    queue([balanceRow()], []);
    sendEmail.mockResolvedValue({ ok: false });
    const res = await runReminderSweep();
    expect(res.failed).toBe(1);
    expect(releaseReminder).toHaveBeenCalledWith("bk-1", "balance");
  });

  it("AI failure falls back to deterministic copy — sent, claim kept", async () => {
    queue([balanceRow()], []);
    draftReminderIntro.mockRejectedValue(new Error("refusal"));
    const res = await runReminderSweep();
    expect(res.balanceSent).toBe(1);
    expect(releaseReminder).not.toHaveBeenCalled();
    expect(sendEmail.mock.calls[0]![0].html).toContain("a friendly reminder from Bounce USA");
  });
});

describe("contract lane", () => {
  it("reminds via SignWell + sends the branded nudge", async () => {
    queue([], [contractRow()]);
    const res = await runReminderSweep();
    expect(res.contractSent).toBe(1);
    expect(remind).toHaveBeenCalledWith("doc-1");
    const email = sendEmail.mock.calls[0]![0];
    expect(email.subject).toBe("Your rental agreement is waiting — Bounce USA");
    expect(email.html).toContain("just re-sent your signing email");
    expect(email.html).not.toContain("http://signwell"); // never a fabricated signing link
  });

  it("skips when no esign doc, or already signed by the customer", async () => {
    queue([], [contractRow({ id: "c1" }), contractRow({ id: "c2" })]);
    getOrderByBookingId
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ esignDocumentId: "doc-2", esignStatus: "signed" });
    const res = await runReminderSweep();
    expect(res.contractSent).toBe(0);
    expect(res.skipped).toBe(2);
  });

  it("SignWell remind failure still sends, with the check-your-inbox phrasing", async () => {
    queue([], [contractRow()]);
    remind.mockRejectedValue(new Error("422"));
    const res = await runReminderSweep();
    expect(res.contractSent).toBe(1);
    expect(sendEmail.mock.calls[0]![0].html).toContain("earlier email from SignWell");
  });
});

describe("caps", () => {
  it("stops an operator's lane at the per-operator cap", async () => {
    queue(
      Array.from({ length: 12 }, (_, i) => balanceRow({ id: `b${i}` })),
      [],
    );
    const res = await runReminderSweep();
    expect(res.balanceSent).toBe(10);
    expect(res.skipped).toBe(2);
  });
});
