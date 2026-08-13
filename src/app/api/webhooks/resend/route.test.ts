import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Inbound-email webhook orchestration. Signature verification and body fetch
 * are mocked (unit-tested in resend-webhook.test.ts); the pure inbound.ts
 * helpers run for real against stubbed env.
 */

const {
  verifyResendWebhook,
  fetchInboundEmail,
  claimWebhookEvent,
  releaseWebhookEvent,
  getInquiryById,
  setInquiryContact,
  findLatestInquiryByIdentity,
  ingestInbound,
  sendEmail,
} = vi.hoisted(() => ({
  verifyResendWebhook: vi.fn(),
  fetchInboundEmail: vi.fn(),
  claimWebhookEvent: vi.fn(),
  releaseWebhookEvent: vi.fn(),
  getInquiryById: vi.fn(),
  setInquiryContact: vi.fn(),
  findLatestInquiryByIdentity: vi.fn(),
  ingestInbound: vi.fn(),
  sendEmail: vi.fn(),
}));

vi.mock("@/lib/email/resend-webhook", () => ({ verifyResendWebhook, fetchInboundEmail }));
vi.mock("@/lib/orders/repo", () => ({ claimWebhookEvent, releaseWebhookEvent }));
vi.mock("@/lib/inquiries/repo", () => ({
  getInquiryById,
  setInquiryContact,
  findLatestInquiryByIdentity,
}));
vi.mock("@/lib/inquiries/ingest", () => ({ ingestInbound }));
vi.mock("@/lib/email", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/email")>()),
  sendEmail, // real buildAiInquiryReplyEmail; mocked transport
}));

import { POST } from "./route";

const INQ = "39672a4c-7279-4060-80e1-42e32bca967e";
const DOMAIN = "inbox.movables.ai";

const event = (over: Record<string, unknown> = {}) => ({
  type: "email.received",
  data: {
    email_id: "em_1",
    from: "Jane <jane@example.com>",
    to: [`reply+${INQ}@${DOMAIN}`],
    received_for: [],
    subject: "Re: your inquiry — Bounce USA",
    ...over,
  },
});

const inquiry = (over: Record<string, unknown> = {}) => ({
  id: INQ,
  operator_id: "op-1",
  customer_name: "Jane",
  customer_email: "jane@example.com",
  channel: "website",
  owner: "ai",
  start_date: "2030-06-01",
  end_date: "2030-06-01",
  ...over,
});

const emailBody = (over: Record<string, unknown> = {}) => ({
  from: "Jane <jane@example.com>",
  subject: "Re: your inquiry — Bounce USA",
  text: "Sounds great, Saturday works!\n\nOn Mon Aug 10, 2026 Bounce USA wrote:\n> hi",
  html: null,
  headers: {},
  ...over,
});

async function run() {
  return POST(new Request("https://x/api/webhooks/resend", { method: "POST", body: "{}" }));
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  vi.stubEnv("RESEND_INBOUND_DOMAIN", DOMAIN);
  vi.stubEnv("RESEND_WEBHOOK_SECRET", "whsec_dGVzdA==");
  findLatestInquiryByIdentity.mockResolvedValue(null);
  verifyResendWebhook.mockReturnValue(event());
  claimWebhookEvent.mockResolvedValue(true);
  getInquiryById.mockResolvedValue(inquiry());
  fetchInboundEmail.mockResolvedValue(emailBody());
  ingestInbound.mockResolvedValue({
    kind: "reply",
    reply: "The Castle is free that day!",
    status: "quoted",
    operator: { name: "Bounce USA", slug: "bounce-usa", contactEmail: "owner@example.com" },
  });
  sendEmail.mockResolvedValue({ ok: true });
});

describe("gates before any work", () => {
  it("env unset → 200 no-op, nothing touched", async () => {
    vi.stubEnv("RESEND_INBOUND_DOMAIN", "");
    const res = await run();
    expect(res.status).toBe(200);
    expect(verifyResendWebhook).not.toHaveBeenCalled();
    expect(claimWebhookEvent).not.toHaveBeenCalled();
  });

  it("signature failure → 403, no claim", async () => {
    verifyResendWebhook.mockImplementation(() => {
      throw new Error("Resend webhook signature mismatch.");
    });
    const res = await run();
    expect(res.status).toBe(403);
    expect(claimWebhookEvent).not.toHaveBeenCalled();
  });

  it("duplicate email_id → 200, no fetch/ingest", async () => {
    claimWebhookEvent.mockResolvedValue(false);
    const res = await run();
    expect(res.status).toBe(200);
    expect(fetchInboundEmail).not.toHaveBeenCalled();
    expect(ingestInbound).not.toHaveBeenCalled();
  });
});

describe("routing + guards", () => {
  it("no plus-addressed recipient and no identity → 200, no ingest", async () => {
    verifyResendWebhook.mockReturnValue(event({ to: ["hello@inbox.movables.ai"] }));
    const res = await run();
    expect(res.status).toBe(200);
    expect(findLatestInquiryByIdentity).toHaveBeenCalledWith("email", "jane@example.com");
    expect(ingestInbound).not.toHaveBeenCalled();
  });

  it("identity fallback: no plus address but the sender is known → routes and replies", async () => {
    verifyResendWebhook.mockReturnValue(event({ to: ["hello@inbox.movables.ai"] }));
    findLatestInquiryByIdentity.mockResolvedValue(inquiry());
    const res = await run();
    expect(res.status).toBe(200);
    expect(ingestInbound).toHaveBeenCalled();
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });

  it("identity-routed mail is exempt from the customer_email mismatch drop", async () => {
    // The identity IS the sender — a differing customer_email just means the
    // customer has two known addresses.
    verifyResendWebhook.mockReturnValue(event({ to: ["hello@inbox.movables.ai"] }));
    findLatestInquiryByIdentity.mockResolvedValue(inquiry({ customer_email: "other@example.com" }));
    const res = await run();
    expect(res.status).toBe(200);
    expect(ingestInbound).toHaveBeenCalled();
  });

  it("prefers received_for (envelope) over to", async () => {
    const other = "11111111-2222-4333-8444-555555555555";
    verifyResendWebhook.mockReturnValue(
      event({ received_for: [`reply+${other}@${DOMAIN}`], to: [`reply+${INQ}@${DOMAIN}`] }),
    );
    getInquiryById.mockResolvedValue(inquiry({ id: other }));
    await run();
    expect(getInquiryById).toHaveBeenCalledWith(other);
  });

  it("unknown inquiry id → 200, no fetch", async () => {
    getInquiryById.mockResolvedValue(null);
    const res = await run();
    expect(res.status).toBe(200);
    expect(fetchInboundEmail).not.toHaveBeenCalled();
  });

  it("body-fetch failure → releases the claim + 500 for a clean retry", async () => {
    fetchInboundEmail.mockResolvedValue(null);
    const res = await run();
    expect(res.status).toBe(500);
    expect(releaseWebhookEvent).toHaveBeenCalledWith("resend", "em_1");
    expect(ingestInbound).not.toHaveBeenCalled();
  });

  it("auto-responder → 200, no ingest, no contact adoption", async () => {
    fetchInboundEmail.mockResolvedValue(emailBody({ headers: { "Auto-Submitted": "auto-replied" } }));
    const res = await run();
    expect(res.status).toBe(200);
    expect(ingestInbound).not.toHaveBeenCalled();
    expect(setInquiryContact).not.toHaveBeenCalled();
  });

  it("sender mismatch on a known-contact thread → 200 drop", async () => {
    fetchInboundEmail.mockResolvedValue(emailBody({ from: "eve@attacker.com" }));
    const res = await run();
    expect(res.status).toBe(200);
    expect(ingestInbound).not.toHaveBeenCalled();
  });

  it("unknown-contact thread adopts the sender, then ingests", async () => {
    getInquiryById.mockResolvedValue(inquiry({ customer_email: null }));
    await run();
    expect(setInquiryContact).toHaveBeenCalledWith("op-1", INQ, {
      email: "jane@example.com",
      name: "Jane",
    });
    expect(ingestInbound).toHaveBeenCalled();
  });
});

describe("ingest + reply delivery", () => {
  it("passes the stripped reply text and email channel to ingest", async () => {
    await run();
    const arg = ingestInbound.mock.calls[0]![0];
    expect(arg.text).toBe("Sounds great, Saturday works!"); // quoted chain stripped
    expect(arg.channel).toBe("email");
    expect(arg.inquiry.id).toBe(INQ);
  });

  it("human-owned (silent) → 200, no email sent", async () => {
    ingestInbound.mockResolvedValue({ kind: "silent" });
    const res = await run();
    expect(res.status).toBe(200);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("AI reply → emailed with plus-address Reply-To, threaded subject, reserve CTA", async () => {
    await run();
    expect(sendEmail).toHaveBeenCalledTimes(1);
    const sent = sendEmail.mock.calls[0]![0];
    expect(sent.to).toBe("jane@example.com");
    expect(sent.replyTo).toBe(`reply+${INQ}@${DOMAIN}`);
    expect(sent.subject).toBe("Re: your inquiry — Bounce USA"); // no "Re: Re:"
    expect(sent.html).toContain("The Castle is free that day!");
    expect(sent.html).toContain("/s/bounce-usa"); // reserve CTA on quoted status
  });

  it("ingest throw → 200 (claim retained), error logged", async () => {
    ingestInbound.mockRejectedValue(new Error("boom"));
    const res = await run();
    expect(res.status).toBe(200);
    expect(releaseWebhookEvent).not.toHaveBeenCalled();
  });
});
