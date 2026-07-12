import { NextResponse } from "next/server";
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
import type Stripe from "stripe";

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
    // Operator subscription (SaaS billing) events — a separate concern from the
    // customer rental payments below, but they arrive on the same platform
    // account, so they share this endpoint (verify + idempotency).
    const stripeEvent = event.raw as Stripe.Event;
    if (isBillingEvent(stripeEvent.type)) {
      await handleBillingEvent(stripeEvent);
      return NextResponse.json({ received: true });
    }

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
            break;
          }

          // A balance payment is on an already-committed booking: just mark it
          // paid-in-full; don't re-confirm, re-notify, or re-send the agreement.
          const isBalance = order.metadata?.payment_type === "balance";
          if (order.bookingId && isBalance) {
            const booking = await getBooking(order.bookingId);
            if (booking) await setBookingDeposit(order.bookingId, booking.total);
            // Alert the operator that the balance is settled (best-effort).
            try {
              const operator = booking ? await getOperatorById(booking.operatorId) : null;
              if (booking && operator && operator.notifyBalancePaid) {
                await notifyOperatorBalancePaid(booking, operator, order.amountTotal);
              }
            } catch (e) {
              console.error("[webhook] balance-paid email failed:", e);
            }
            break;
          }

          // Advance the linked booking to paid + run the final oversell guard.
          if (order.bookingId) {
            const { oversold } = await confirmBookingPaid(order.bookingId);
            if (oversold.length) {
              console.warn(
                `[webhook] OVERSOLD booking ${order.bookingId}: ${JSON.stringify(oversold)}`,
              );
            }
            // Confirmation to the customer + alert to the operator (best-effort).
            try {
              const booking = await getBooking(order.bookingId);
              const operator = booking ? await getOperatorById(booking.operatorId) : null;
              if (booking && operator) {
                await notifyBookingConfirmed(booking, operator, order.amountTotal);
                if (operator.notifyNewBooking) {
                  await notifyOperatorNewBooking(booking, operator, order.amountTotal);
                }
              }
            } catch (e) {
              console.error("[webhook] booking emails failed:", e);
            }
          }

          // Send the signing agreement for the freshly-paid order (also moves
          // the booking to `contracted`). Guarded by esignDocumentId so a
          // webhook retry never double-sends. Best-effort: the booking is
          // already paid + confirmed above, so an e-sign provider failure
          // (expired plan, downtime) must NOT fail the webhook or trigger
          // Stripe retries — log and move on.
          if (autoSendEnabled() && !order.esignDocumentId) {
            try {
              await sendAgreementForOrder(order);
            } catch (e) {
              console.error("[webhook] agreement send failed (e-sign is best-effort):", e);
            }
          }
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
