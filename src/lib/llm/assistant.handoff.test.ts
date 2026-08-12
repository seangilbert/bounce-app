import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * The handoff gate (inbox-plan Phase 0): when a human owns a thread, the AI must
 * not call the model or answer — and the customer's message must still reach the
 * operator's thread. Every collaborator is mocked; the model client's parse/create
 * fns fail loudly if a paused path ever reaches them.
 */

const {
  parse,
  create,
  getOperatorById,
  listItems,
  availabilityForOperator,
  getInquiryById,
  recordCustomerInbound,
  appendInquiryMessage,
  markInquiryNeedsHuman,
  createInquiry,
  getQuoteQuota,
} = vi.hoisted(() => ({
  parse: vi.fn(),
  create: vi.fn(),
  getOperatorById: vi.fn(),
  listItems: vi.fn(),
  availabilityForOperator: vi.fn(),
  getInquiryById: vi.fn(),
  recordCustomerInbound: vi.fn(),
  appendInquiryMessage: vi.fn(),
  markInquiryNeedsHuman: vi.fn(),
  createInquiry: vi.fn(),
  getQuoteQuota: vi.fn(),
}));

vi.mock("./client", () => ({ getAnthropicClient: () => ({ messages: { parse, create } }) }));
vi.mock("@/lib/inventory/repo", () => ({ getOperatorById, listItems }));
vi.mock("@/lib/inventory/availability", () => ({ availabilityForOperator }));
vi.mock("@/lib/inventory/pricing", () => ({
  durationDays: () => 1,
  lineTotal: () => 20000,
  priceBreakdown: () => ({ subtotal: 20000, deliveryFee: 0, tax: 0, total: 20000 }),
}));
vi.mock("@/lib/availability/schedule", () => ({
  assessRange: () => ({ ok: true }),
  normalizeSchedule: () => ({}),
}));
vi.mock("@/lib/inquiries/repo", () => ({
  createInquiry,
  getInquiryById,
  recordCustomerInbound,
  appendInquiryMessage,
  markInquiryNeedsHuman,
}));
vi.mock("@/lib/email", () => ({ notifyOperatorNewInquiry: vi.fn() }));
vi.mock("@/lib/usage/ai-quotes", () => ({ getQuoteQuota, incrementAiQuoteUsage: vi.fn() }));
vi.mock("@/lib/plans", () => ({ planCapabilities: () => ({ aiQuotesPerMonth: Infinity }) }));
vi.mock("@/lib/promos/repo", () => ({ listAssistantPromos: vi.fn().mockResolvedValue([]) }));
vi.mock("./operator-config", () => ({ buildOperatorConfig: () => "- Service area: Plymouth, MA." }));

import {
  handleInquiry,
  draftOperatorReply,
  buildDraftInstruction,
  buildSystemPrompt,
  HUMAN_OWNED_ACK,
} from "./assistant";

const OPERATOR = {
  id: "op-1",
  name: "Bounce USA",
  location: "Plymouth, MA",
  assistantInstructions: null,
  depositPercent: 30,
  autoQuoteCapCents: 50000,
  minLeadHours: 0,
  deliveryMode: "flat",
  deliveryFeeCents: 0,
  taxPercent: 0,
  deliveryTaxable: false,
  contactEmail: "owner@example.com",
  notifyNewInquiry: false,
  availabilityConfig: null,
  slug: "bounce-usa",
};

const row = (owner: "ai" | "needs_human" | "human") => ({
  id: "inq-1",
  operator_id: "op-1",
  owner,
  channel: "website",
  status: owner === "needs_human" ? "needs_review" : "auto",
});

const CHAT = {
  operatorId: "op-1",
  inquiryId: "inq-1",
  messages: [
    { role: "user" as const, content: "hi" },
    { role: "assistant" as const, content: "hello!" },
    { role: "user" as const, content: "is it still available?" },
  ],
};

const CATALOG_ITEM = {
  id: "i1",
  name: "Rainbow Castle",
  category: null,
  basePrice: 20000,
  priceUnit: "per_day",
  powerRequired: false,
  availability: { available: 3 },
};

beforeEach(() => {
  vi.clearAllMocks();
  getOperatorById.mockResolvedValue(OPERATOR);
  getQuoteQuota.mockResolvedValue({ atLimit: false });
  listItems.mockResolvedValue([]);
  availabilityForOperator.mockResolvedValue([CATALOG_ITEM]);
});

describe("handleInquiry — handoff gate", () => {
  it("human-owned: no model call, static ack, message persisted for the operator", async () => {
    getInquiryById.mockResolvedValue(row("human"));
    const res = await handleInquiry(CHAT, { persistTurn: true });
    expect(parse).not.toHaveBeenCalled();
    expect(res.reply).toBe(HUMAN_OWNED_ACK);
    expect(res.status).toBe("gathering"); // operator-owned chat stays open
    expect(res.quote).toBeNull();
    // The LAST user turn is what gets saved, on the thread's channel.
    expect(recordCustomerInbound).toHaveBeenCalledWith("inq-1", "is it still available?", "website");
  });

  it("needs-human: acks with status 'review' so the contact-capture box stays visible", async () => {
    getInquiryById.mockResolvedValue(row("needs_human"));
    const res = await handleInquiry(CHAT); // no persistTurn (webhook-style caller)
    expect(parse).not.toHaveBeenCalled();
    expect(res.status).toBe("review");
    expect(recordCustomerInbound).not.toHaveBeenCalled();
  });

  it("ai-owned: proceeds to the model, persists both turns, no escalation on 'ask'", async () => {
    getInquiryById.mockResolvedValue(row("ai"));
    parse.mockResolvedValue({
      stop_reason: "end_turn",
      parsed_output: {
        action: "ask",
        reply: "What date is the party?",
        eventDate: null,
        lineItems: [],
        unmatchedRequests: [],
      },
    });
    const res = await handleInquiry(CHAT, { persistTurn: true });
    expect(parse).toHaveBeenCalledTimes(1);
    expect(res.reply).toBe("What date is the party?");
    expect(recordCustomerInbound).toHaveBeenCalledWith("inq-1", "is it still available?", "website");
    expect(appendInquiryMessage).toHaveBeenCalledWith("inq-1", "ai", "What date is the party?", {
      channel: "website",
      direction: "outbound",
    });
    expect(markInquiryNeedsHuman).not.toHaveBeenCalled();
  });

  it("centralizes escalation: a mid-conversation 'review' flips the existing row", async () => {
    getInquiryById.mockResolvedValue(row("ai"));
    // A grounded quote whose total (20000) exceeds the operator's cap → review.
    getOperatorById.mockResolvedValue({ ...OPERATOR, autoQuoteCapCents: 10000 });
    parse.mockResolvedValue({
      stop_reason: "end_turn",
      parsed_output: {
        action: "quote",
        reply: "The Rainbow Castle is perfect!",
        eventDate: "2030-06-01",
        lineItems: [{ itemId: "i1", name: "Rainbow Castle", quantity: 1 }],
        unmatchedRequests: [],
      },
    });
    const res = await handleInquiry({ ...CHAT, startDate: "2030-06-01" });
    expect(res.status).toBe("review");
    expect(markInquiryNeedsHuman).toHaveBeenCalledWith("inq-1");
    // Existing conversation — no duplicate inbox row.
    expect(createInquiry).not.toHaveBeenCalled();
  });

  it("new conversations (no inquiryId) never hit the gate or the row lookup", async () => {
    parse.mockResolvedValue({
      stop_reason: "end_turn",
      parsed_output: { action: "ask", reply: "Hi!", eventDate: null, lineItems: [], unmatchedRequests: [] },
    });
    await handleInquiry({ operatorId: "op-1", messages: [{ role: "user", content: "hi" }] });
    expect(getInquiryById).not.toHaveBeenCalled();
  });
});

describe("draftOperatorReply — AI-as-copilot", () => {
  it("uses the customer-agent system prompt plus the draft mode-switch, ends on a user turn", async () => {
    create.mockResolvedValue({
      stop_reason: "end_turn",
      content: [{ type: "text", text: "  Hi Jane — the Castle is free that day. Want me to hold it?  " }],
    });
    const messages = [
      { role: "user" as const, content: "hi" },
      { role: "assistant" as const, content: "hello!" },
    ];
    const draft = await draftOperatorReply("op-1", messages, { startDate: "2030-06-01" });
    expect(draft).toBe("Hi Jane — the Castle is free that day. Want me to hold it?");

    const req = create.mock.calls[0]![0];
    // Grounded exactly like the customer agent, with the copilot switch appended.
    expect(req.system.endsWith(buildDraftInstruction("Bounce USA"))).toBe(true);
    expect(req.system).toContain("How to behave:");
    // A thread ending on an assistant turn would be a prefill (400) — the call
    // must always end on a user instruction turn.
    const last = req.messages[req.messages.length - 1];
    expect(last.role).toBe("user");
  });
});

describe("buildDraftInstruction", () => {
  it("frames a human-reviewed draft: body only, placeholders over invention", () => {
    const d = buildDraftInstruction("Bounce USA");
    expect(d).toContain("review, edit, and send");
    expect(d).toContain("ONLY the message body");
    expect(d).toContain("[FILL IN]");
    // It relaxes the no-prices rule only for prices already in-conversation.
    expect(d).toContain("already appears earlier in this conversation");
  });

  it("appended to the customer prompt, it reads as a mode change", () => {
    const combined =
      buildSystemPrompt(
        { name: "Bounce USA", location: null, assistantInstructions: null } as never,
        "2026-08-11",
        "- [i1] Rainbow Castle: $200.00 per_day",
        false,
        "- Service area: Plymouth, MA.",
      ) + buildDraftInstruction("Bounce USA");
    expect(combined.indexOf("How to behave:")).toBeLessThan(combined.indexOf("MODE CHANGE"));
  });
});
