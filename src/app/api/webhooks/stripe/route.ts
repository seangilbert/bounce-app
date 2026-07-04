import { NextResponse } from "next/server";
import { getPaymentProvider } from "@/lib/payments";
import {
  claimWebhookEvent,
  releaseWebhookEvent,
  setOrderStatusByPaymentId,
  setOrderStatusBySessionId,
} from "@/lib/orders/repo";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  // IMPORTANT: read the RAW body before any parsing — signature verification
  // is computed over the exact bytes Stripe sent.
  const rawBody = await req.text();

  const provider = getPaymentProvider();

  let event;
  try {
    event = await provider.verifyWebhook(rawBody, req.headers);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid webhook.";
    // 400 tells Stripe the signature/verification failed; it will not retry
    // a 400 indefinitely, and we don't want to ack an unverified payload.
    return NextResponse.json({ error: message }, { status: 400 });
  }

  // Idempotency: claim the event before acting. A duplicate delivery finds it
  // already claimed and is acked without re-processing.
  let claimed: boolean;
  try {
    claimed = await claimWebhookEvent(provider.name, event.id);
  } catch (err) {
    const message = err instanceof Error ? err.message : "claim failed";
    // Storage is down — 500 so the provider retries rather than dropping it.
    return NextResponse.json({ error: message }, { status: 500 });
  }
  if (!claimed) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  try {
    switch (event.type) {
      case "checkout.completed":
        if (event.sessionId) {
          const order = await setOrderStatusBySessionId(
            provider.name,
            event.sessionId,
            "paid",
            event.paymentId ?? null,
          );
          if (!order) {
            console.warn(
              `[webhook] checkout.completed: no local order for session ${event.sessionId}`,
            );
          }
          // TODO(step 3): trigger SignWell / fulfillment for the paid order.
        }
        break;

      case "refund.updated":
        if (event.paymentId) {
          await setOrderStatusByPaymentId(provider.name, event.paymentId, "refunded");
        }
        break;

      case "payment.failed":
        // A payment_intent failure isn't reliably linked to a pending order
        // (the session's intent id is only recorded once it completes), so this
        // is best-effort: mark failed only if we already know the payment id.
        if (event.paymentId) {
          await setOrderStatusByPaymentId(provider.name, event.paymentId, "failed");
        }
        break;

      case "payment.succeeded":
      default:
        // Acknowledged; the checkout.completed event drives the paid state.
        break;
    }
  } catch (err) {
    // Processing failed after we claimed the event — release the claim so the
    // provider's retry re-processes instead of being skipped as a duplicate.
    await releaseWebhookEvent(provider.name, event.id).catch(() => {});
    const message = err instanceof Error ? err.message : "handler error";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
