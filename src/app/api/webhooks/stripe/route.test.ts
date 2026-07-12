import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock every collaborator so the test exercises only the handler's orchestration
// (idempotency, branch selection, best-effort error handling) — no DB/Stripe.
vi.mock("@/lib/payments", () => ({ getPaymentProvider: vi.fn() }));
vi.mock("@/lib/orders/repo", () => ({
  claimWebhookEvent: vi.fn(),
  releaseWebhookEvent: vi.fn(),
  setOrderStatusByPaymentId: vi.fn(),
  setOrderStatusBySessionId: vi.fn(),
}));
vi.mock("@/lib/esign/agreements", () => ({
  autoSendEnabled: vi.fn(),
  sendAgreementForOrder: vi.fn(),
}));
vi.mock("@/lib/bookings/repo", () => ({
  confirmBookingPaid: vi.fn(),
  getBooking: vi.fn(),
  setBookingDeposit: vi.fn(),
}));
vi.mock("@/lib/inventory/repo", () => ({ getOperatorById: vi.fn() }));
vi.mock("@/lib/email", () => ({
  notifyBookingConfirmed: vi.fn(),
  notifyOperatorNewBooking: vi.fn(),
  notifyOperatorBalancePaid: vi.fn(),
}));
vi.mock("@/lib/billing/webhook", () => ({ isBillingEvent: vi.fn(), handleBillingEvent: vi.fn() }));
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));

import { POST } from "./route";
import { getPaymentProvider } from "@/lib/payments";
import {
  claimWebhookEvent,
  releaseWebhookEvent,
  setOrderStatusByPaymentId,
  setOrderStatusBySessionId,
} from "@/lib/orders/repo";
import { autoSendEnabled, sendAgreementForOrder } from "@/lib/esign/agreements";
import { confirmBookingPaid, getBooking, setBookingDeposit } from "@/lib/bookings/repo";
import { getOperatorById } from "@/lib/inventory/repo";
import { notifyBookingConfirmed, notifyOperatorNewBooking, notifyOperatorBalancePaid } from "@/lib/email";
import { isBillingEvent, handleBillingEvent } from "@/lib/billing/webhook";
import * as Sentry from "@sentry/nextjs";

const makeEvent = (over: Record<string, unknown> = {}) => ({
  id: "evt_1",
  type: "checkout.completed",
  sessionId: "cs_1",
  paymentId: "pi_1",
  raw: { type: "checkout.session.completed" },
  ...over,
});

const makeOrder = (over: Record<string, unknown> = {}) => ({
  bookingId: "bk_1",
  metadata: {},
  esignDocumentId: null,
  amountTotal: 5000,
  ...over,
});

/** Run the handler with a given verified event (or a verify that throws). */
async function run(event: unknown, opts: { verifyThrows?: Error } = {}) {
  vi.mocked(getPaymentProvider).mockReturnValue({
    name: "stripe",
    verifyWebhook: opts.verifyThrows
      ? vi.fn().mockRejectedValue(opts.verifyThrows)
      : vi.fn().mockResolvedValue(event),
  } as never);
  return POST(new Request("https://x/api/webhooks/stripe", { method: "POST", body: "{}" }));
}

beforeEach(() => {
  vi.clearAllMocks();
  // Sensible defaults for the happy path; individual tests override.
  vi.mocked(claimWebhookEvent).mockResolvedValue(true);
  vi.mocked(releaseWebhookEvent).mockResolvedValue(undefined as never);
  vi.mocked(isBillingEvent).mockReturnValue(false);
  vi.mocked(setOrderStatusBySessionId).mockResolvedValue(makeOrder() as never);
  vi.mocked(confirmBookingPaid).mockResolvedValue({ oversold: [] } as never);
  vi.mocked(autoSendEnabled).mockReturnValue(true);
  vi.mocked(sendAgreementForOrder).mockResolvedValue(undefined as never);
  vi.mocked(getBooking).mockResolvedValue({ id: "bk_1", operatorId: "op_1", total: 10000 } as never);
  vi.mocked(getOperatorById).mockResolvedValue({ id: "op_1", notifyNewBooking: true, notifyBalancePaid: true } as never);
});

describe("stripe webhook — verification & idempotency", () => {
  it("returns 400 on a bad signature and never claims the event", async () => {
    const res = await run(makeEvent(), { verifyThrows: new Error("bad sig") });
    expect(res.status).toBe(400);
    expect(claimWebhookEvent).not.toHaveBeenCalled();
  });

  it("returns 500 when the idempotency claim store is down (so the provider retries)", async () => {
    vi.mocked(claimWebhookEvent).mockRejectedValue(new Error("db down"));
    const res = await run(makeEvent());
    expect(res.status).toBe(500);
    expect(setOrderStatusBySessionId).not.toHaveBeenCalled();
  });

  it("acks a duplicate delivery without re-processing", async () => {
    vi.mocked(claimWebhookEvent).mockResolvedValue(false);
    const res = await run(makeEvent());
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ duplicate: true });
    expect(setOrderStatusBySessionId).not.toHaveBeenCalled();
  });

  it("routes subscription/billing events to the billing handler and returns early", async () => {
    vi.mocked(isBillingEvent).mockReturnValue(true);
    const res = await run(makeEvent({ raw: { type: "customer.subscription.updated" } }));
    expect(res.status).toBe(200);
    expect(handleBillingEvent).toHaveBeenCalledOnce();
    expect(setOrderStatusBySessionId).not.toHaveBeenCalled();
  });
});

describe("stripe webhook — new paid booking", () => {
  it("confirms the booking, notifies, and sends the agreement", async () => {
    const res = await run(makeEvent());
    expect(res.status).toBe(200);
    expect(confirmBookingPaid).toHaveBeenCalledWith("bk_1");
    expect(notifyBookingConfirmed).toHaveBeenCalledOnce();
    expect(notifyOperatorNewBooking).toHaveBeenCalledOnce();
    expect(sendAgreementForOrder).toHaveBeenCalledOnce();
  });

  it("skips the operator alert when the operator disabled new-booking notifications", async () => {
    vi.mocked(getOperatorById).mockResolvedValue({ id: "op_1", notifyNewBooking: false } as never);
    await run(makeEvent());
    expect(notifyBookingConfirmed).toHaveBeenCalledOnce(); // customer still notified
    expect(notifyOperatorNewBooking).not.toHaveBeenCalled();
  });

  it("does not resend the agreement when one was already sent (retry-safe)", async () => {
    vi.mocked(setOrderStatusBySessionId).mockResolvedValue(makeOrder({ esignDocumentId: "doc_1" }) as never);
    await run(makeEvent());
    expect(sendAgreementForOrder).not.toHaveBeenCalled();
  });

  it("does not send the agreement when auto-send is off", async () => {
    vi.mocked(autoSendEnabled).mockReturnValue(false);
    await run(makeEvent());
    expect(sendAgreementForOrder).not.toHaveBeenCalled();
  });

  it("still acks 200 when the agreement send fails (best-effort) and reports to Sentry", async () => {
    vi.mocked(sendAgreementForOrder).mockRejectedValue(new Error("signwell 401"));
    const res = await run(makeEvent());
    expect(res.status).toBe(200); // payment is already committed — must not fail the webhook
    expect(Sentry.captureException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ tags: expect.objectContaining({ step: "agreement_send" }) }),
    );
  });

  it("breaks cleanly when no local order matches the session", async () => {
    vi.mocked(setOrderStatusBySessionId).mockResolvedValue(null as never);
    const res = await run(makeEvent());
    expect(res.status).toBe(200);
    expect(confirmBookingPaid).not.toHaveBeenCalled();
  });
});

describe("stripe webhook — balance payment", () => {
  it("marks the booking paid-in-full without re-confirming or re-sending the agreement", async () => {
    vi.mocked(setOrderStatusBySessionId).mockResolvedValue(
      makeOrder({ metadata: { payment_type: "balance" } }) as never,
    );
    const res = await run(makeEvent());
    expect(res.status).toBe(200);
    expect(setBookingDeposit).toHaveBeenCalledWith("bk_1", 10000); // paid up to the booking total
    expect(confirmBookingPaid).not.toHaveBeenCalled();
    expect(sendAgreementForOrder).not.toHaveBeenCalled();
    expect(notifyOperatorBalancePaid).toHaveBeenCalledOnce();
  });
});

describe("stripe webhook — refund & handler failure", () => {
  it("marks an order refunded on refund.updated", async () => {
    await run(makeEvent({ type: "refund.updated", paymentId: "pi_9" }));
    expect(setOrderStatusByPaymentId).toHaveBeenCalledWith("stripe", "pi_9", "refunded");
  });

  it("releases the claim and 500s (so the provider retries) when processing throws", async () => {
    vi.mocked(confirmBookingPaid).mockRejectedValue(new Error("kaboom"));
    const res = await run(makeEvent());
    expect(res.status).toBe(500);
    expect(releaseWebhookEvent).toHaveBeenCalledWith("stripe", "evt_1");
    expect(Sentry.captureException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ tags: expect.objectContaining({ step: "handler" }) }),
    );
  });
});
