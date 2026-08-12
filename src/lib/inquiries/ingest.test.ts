import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * The shared inbound pipeline, tested directly (the Twilio route tests cover it
 * end-to-end through the SMS route; the Resend route reuses it for email).
 */

const {
  recordCustomerInbound,
  appendInquiryMessage,
  listMessagesByInquiry,
  setInquiryStatus,
  handleInquiry,
  getOperatorById,
  notifyOperatorNewInquiry,
} = vi.hoisted(() => ({
  recordCustomerInbound: vi.fn(),
  appendInquiryMessage: vi.fn(),
  listMessagesByInquiry: vi.fn(),
  setInquiryStatus: vi.fn(),
  handleInquiry: vi.fn(),
  getOperatorById: vi.fn(),
  notifyOperatorNewInquiry: vi.fn(),
}));

vi.mock("@/lib/inquiries/repo", () => ({
  recordCustomerInbound,
  appendInquiryMessage,
  listMessagesByInquiry,
  setInquiryStatus,
}));
vi.mock("@/lib/llm/assistant", () => ({ handleInquiry }));
vi.mock("@/lib/inventory/repo", () => ({ getOperatorById }));
vi.mock("@/lib/email", () => ({ notifyOperatorNewInquiry }));

import { ingestInbound } from "./ingest";
import type { InquiryRow } from "./repo";

const inquiry = (over: Partial<InquiryRow> = {}): InquiryRow =>
  ({
    id: "inq-1",
    operator_id: "op-1",
    customer_name: null,
    channel: "email",
    start_date: "2030-06-01",
    end_date: "2030-06-01",
    owner: "ai",
    last_customer_at: null,
    last_human_at: null,
    ...over,
  }) as InquiryRow;

const OPERATOR = {
  id: "op-1",
  name: "Bounce USA",
  slug: "bounce-usa",
  contactEmail: "owner@example.com",
  notifyNewInquiry: true,
};

beforeEach(() => {
  vi.clearAllMocks();
  getOperatorById.mockResolvedValue(OPERATOR);
  listMessagesByInquiry.mockResolvedValue(new Map([["inq-1", []]]));
});

describe("owner gate", () => {
  it("human-owned first-of-burst: saves, notifies once, silent", async () => {
    const res = await ingestInbound({
      inquiry: inquiry({ owner: "human", last_human_at: "2026-08-11T10:00:00Z" }),
      text: "hello?",
      channel: "email",
      customerLabel: "jane@example.com",
    });
    expect(res).toEqual({ kind: "silent" });
    expect(recordCustomerInbound).toHaveBeenCalledWith("inq-1", "hello?", "email");
    expect(handleInquiry).not.toHaveBeenCalled();
    expect(notifyOperatorNewInquiry).toHaveBeenCalledTimes(1);
    // Fallback label used when customer_name is null; link built from urls.ts.
    const arg = notifyOperatorNewInquiry.mock.calls[0]![0];
    expect(arg.customer).toBe("jane@example.com");
    expect(arg.link).toContain("/inquiries");
  });

  it("human-owned mid-burst: silent, no second alert", async () => {
    const res = await ingestInbound({
      inquiry: inquiry({
        owner: "human",
        last_customer_at: "2026-08-11T11:00:00Z",
        last_human_at: "2026-08-11T10:00:00Z",
      }),
      text: "still there?",
      channel: "email",
      customerLabel: "jane@example.com",
    });
    expect(res).toEqual({ kind: "silent" });
    expect(notifyOperatorNewInquiry).not.toHaveBeenCalled();
  });

  it("needs_human: silent, no alert (ack + alert already sent at escalation)", async () => {
    const res = await ingestInbound({
      inquiry: inquiry({ owner: "needs_human" }),
      text: "anyone?",
      channel: "sms",
      customerLabel: "+15551230000",
    });
    expect(res).toEqual({ kind: "silent" });
    expect(recordCustomerInbound).toHaveBeenCalledWith("inq-1", "anyone?", "sms");
    expect(notifyOperatorNewInquiry).not.toHaveBeenCalled();
  });
});

describe("ai-owned", () => {
  it("review outcome: persists both turns, alerts operator, no status double-write", async () => {
    handleInquiry.mockResolvedValue({ reply: "Flagging for the team!", status: "review" });
    const res = await ingestInbound({
      inquiry: inquiry(),
      text: "need a custom package",
      channel: "email",
      customerLabel: "jane@example.com",
    });
    expect(res).toMatchObject({ kind: "reply", status: "review", operator: OPERATOR });
    expect(appendInquiryMessage).toHaveBeenCalledWith("inq-1", "ai", "Flagging for the team!", {
      channel: "email",
      direction: "outbound",
    });
    expect(setInquiryStatus).not.toHaveBeenCalled(); // handleInquiry owns escalation
    expect(notifyOperatorNewInquiry).toHaveBeenCalledTimes(1);
  });

  it("quoted outcome: marks auto and returns the operator for channel decoration", async () => {
    handleInquiry.mockResolvedValue({ reply: "The Castle is free!", status: "quoted" });
    const res = await ingestInbound({
      inquiry: inquiry(),
      text: "is it free Saturday?",
      channel: "email",
      customerLabel: "jane@example.com",
    });
    expect(res).toMatchObject({ kind: "reply", status: "quoted", reply: "The Castle is free!" });
    expect(setInquiryStatus).toHaveBeenCalledWith("inq-1", "auto");
    expect(notifyOperatorNewInquiry).not.toHaveBeenCalled();
  });
});
