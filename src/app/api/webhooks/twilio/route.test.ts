import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Inbound-SMS orchestration around the handoff gate: a human-owned thread saves
 * the message and stays silent (empty TwiML, no AI); the operator is alerted
 * once per customer reply burst, not per message.
 */

const {
  verifyWebhook,
  smsEnabled,
  claimWebhookEvent,
  findLatestInquiryByPhone,
  findLatestInquiryByIdentity,
  appendInquiryMessage,
  listMessagesByInquiry,
  setInquiryStatus,
  recordCustomerInbound,
  handleInquiry,
  getOperatorById,
  notifyOperatorNewInquiry,
} = vi.hoisted(() => ({
  verifyWebhook: vi.fn(),
  smsEnabled: vi.fn(),
  claimWebhookEvent: vi.fn(),
  findLatestInquiryByPhone: vi.fn(),
  findLatestInquiryByIdentity: vi.fn(),
  appendInquiryMessage: vi.fn(),
  listMessagesByInquiry: vi.fn(),
  setInquiryStatus: vi.fn(),
  recordCustomerInbound: vi.fn(),
  handleInquiry: vi.fn(),
  getOperatorById: vi.fn(),
  notifyOperatorNewInquiry: vi.fn(),
}));

vi.mock("@/lib/sms", () => ({
  smsEnabled,
  getSmsProvider: () => ({ verifyWebhook }),
}));
vi.mock("@/lib/orders/repo", () => ({ claimWebhookEvent }));
vi.mock("@/lib/inquiries/repo", () => ({
  findLatestInquiryByPhone,
  findLatestInquiryByIdentity,
  appendInquiryMessage,
  listMessagesByInquiry,
  setInquiryStatus,
  recordCustomerInbound,
}));
vi.mock("@/lib/llm/assistant", () => ({ handleInquiry }));
vi.mock("@/lib/inventory/repo", () => ({ getOperatorById }));
vi.mock("@/lib/email", () => ({ notifyOperatorNewInquiry }));

import { POST } from "./route";

const EMPTY_TWIML = '<?xml version="1.0" encoding="UTF-8"?><Response></Response>';

const inquiry = (over: Record<string, unknown> = {}) => ({
  id: "inq-1",
  operator_id: "op-1",
  customer_name: "Jane",
  channel: "sms",
  start_date: "2030-06-01",
  end_date: "2030-06-01",
  owner: "ai",
  last_customer_at: null,
  last_human_at: null,
  ...over,
});

async function run() {
  return POST(
    new Request("https://x/api/webhooks/twilio", { method: "POST", body: "From=%2B15551230000" }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  findLatestInquiryByIdentity.mockResolvedValue(null);
  smsEnabled.mockReturnValue(true);
  verifyWebhook.mockResolvedValue({ from: "+15551230000", body: "is it available?", messageSid: "SM1" });
  claimWebhookEvent.mockResolvedValue(true);
  listMessagesByInquiry.mockResolvedValue(new Map([["inq-1", []]]));
  getOperatorById.mockResolvedValue({
    name: "Bounce USA",
    slug: "bounce-usa",
    contactEmail: "owner@example.com",
    notifyNewInquiry: true,
  });
});

describe("human-owned thread (operator took over)", () => {
  it("saves the message, sends nothing, and alerts on the first message of a burst", async () => {
    findLatestInquiryByPhone.mockResolvedValue(
      inquiry({ owner: "human", last_customer_at: null, last_human_at: "2026-08-11T10:00:00Z" }),
    );
    const res = await run();
    expect(await res.text()).toBe(EMPTY_TWIML);
    expect(recordCustomerInbound).toHaveBeenCalledWith("inq-1", "is it available?", "sms");
    expect(handleInquiry).not.toHaveBeenCalled();
    expect(notifyOperatorNewInquiry).toHaveBeenCalledTimes(1);
  });

  it("stays quiet mid-burst — no second alert while the customer keeps typing", async () => {
    findLatestInquiryByPhone.mockResolvedValue(
      inquiry({
        owner: "human",
        last_customer_at: "2026-08-11T11:00:00Z", // customer already wrote after…
        last_human_at: "2026-08-11T10:00:00Z", // …the operator's last activity
      }),
    );
    const res = await run();
    expect(await res.text()).toBe(EMPTY_TWIML);
    expect(recordCustomerInbound).toHaveBeenCalled();
    expect(notifyOperatorNewInquiry).not.toHaveBeenCalled();
  });
});

describe("needs-human thread (escalated, awaiting pickup)", () => {
  it("saves silently — the ack and the operator alert were sent at escalation", async () => {
    findLatestInquiryByPhone.mockResolvedValue(inquiry({ owner: "needs_human" }));
    const res = await run();
    expect(await res.text()).toBe(EMPTY_TWIML);
    expect(recordCustomerInbound).toHaveBeenCalledWith("inq-1", "is it available?", "sms");
    expect(handleInquiry).not.toHaveBeenCalled();
    expect(notifyOperatorNewInquiry).not.toHaveBeenCalled();
  });
});

describe("ai-owned thread (normal loop)", () => {
  it("runs the AI and replies; escalation status is handled inside handleInquiry", async () => {
    findLatestInquiryByPhone.mockResolvedValue(inquiry({ owner: "ai" }));
    handleInquiry.mockResolvedValue({ reply: "Flagging this for the team!", status: "review" });
    const res = await run();
    expect(handleInquiry).toHaveBeenCalledTimes(1);
    expect(await res.text()).toContain("Flagging this for the team!");
    // The route must NOT double-write the escalation — handleInquiry owns it now.
    expect(setInquiryStatus).not.toHaveBeenCalledWith("inq-1", "needs_review");
    expect(notifyOperatorNewInquiry).toHaveBeenCalledTimes(1);
  });

  it("appends a reserve link on a quoted reply and keeps the thread auto", async () => {
    findLatestInquiryByPhone.mockResolvedValue(inquiry({ owner: "ai" }));
    handleInquiry.mockResolvedValue({ reply: "The Castle is free that day!", status: "quoted" });
    const res = await run();
    const body = await res.text();
    expect(body).toContain("Reserve online");
    expect(setInquiryStatus).toHaveBeenCalledWith("inq-1", "auto");
  });

  it("unknown sender: acks empty (no thread to route to)", async () => {
    findLatestInquiryByPhone.mockResolvedValue(null);
    const res = await run();
    expect(await res.text()).toBe(EMPTY_TWIML);
    expect(findLatestInquiryByIdentity).toHaveBeenCalledWith("sms", "+15551230000");
    expect(handleInquiry).not.toHaveBeenCalled();
    expect(recordCustomerInbound).not.toHaveBeenCalled();
  });

  it("identity fallback: phone not on any inquiry but known to the CRM → routes", async () => {
    findLatestInquiryByPhone.mockResolvedValue(null);
    findLatestInquiryByIdentity.mockResolvedValue(inquiry({ owner: "ai" }));
    handleInquiry.mockResolvedValue({ reply: "Welcome back!", status: "gathering" });
    const res = await run();
    expect(await res.text()).toContain("Welcome back!");
    expect(recordCustomerInbound).toHaveBeenCalledWith("inq-1", "is it available?", "sms");
  });
});
