import Stripe from "stripe";
import { CHECKOUT_HOLD_MINUTES } from "@/lib/checkout-hold";
import type {
  CheckoutInput,
  CheckoutResult,
  Money,
  PaymentEvent,
  PaymentEventType,
  PaymentProvider,
  RefundResult,
} from "./types";

let stripe: Stripe | null = null;

function client(): Stripe {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error("STRIPE_SECRET_KEY is not set. Add it to .env.local.");
  }
  if (!stripe) {
    stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  }
  return stripe;
}

/** The shared Stripe SDK client, for flows beyond the PaymentProvider interface
 * (e.g. operator subscription billing). */
export function getStripeClient(): Stripe {
  return client();
}

/** Map Stripe event types onto our normalized set. */
function normalizeEventType(stripeType: string): PaymentEventType {
  switch (stripeType) {
    case "checkout.session.completed":
      return "checkout.completed";
    case "payment_intent.succeeded":
      return "payment.succeeded";
    case "payment_intent.payment_failed":
      return "payment.failed";
    case "charge.refunded":
    case "refund.updated":
      return "refund.updated";
    default:
      return "unknown";
  }
}

export const stripeProvider: PaymentProvider = {
  name: "stripe",

  async createCheckout(input: CheckoutInput): Promise<CheckoutResult> {
    const session = await client().checkout.sessions.create({
      mode: "payment",
      // Expire the session with the inventory hold, so a stale session can't be
      // paid after its booking's hold has been released.
      expires_at: Math.floor(Date.now() / 1000) + CHECKOUT_HOLD_MINUTES * 60,
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
      customer_email: input.customerEmail,
      metadata: input.metadata,
      line_items: input.lineItems.map((li) => ({
        quantity: li.quantity,
        price_data: {
          currency: input.currency,
          unit_amount: li.unitAmount,
          product_data: { name: li.name },
        },
      })),
    });

    if (!session.url) {
      throw new Error("Stripe did not return a checkout URL.");
    }
    return { id: session.id, url: session.url };
  },

  async refund(paymentId: string, amount?: Money): Promise<RefundResult> {
    // `paymentId` is treated as a PaymentIntent id.
    const refund = await client().refunds.create({
      payment_intent: paymentId,
      ...(amount ? { amount: amount.amount } : {}),
    });
    return { id: refund.id, status: refund.status ?? "unknown" };
  },

  async verifyWebhook(rawBody: string, headers: Headers): Promise<PaymentEvent> {
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!secret) {
      throw new Error("STRIPE_WEBHOOK_SECRET is not set.");
    }
    const signature = headers.get("stripe-signature");
    if (!signature) {
      throw new Error("Missing stripe-signature header.");
    }
    // Throws if the signature doesn't verify against the raw body.
    const event = await client().webhooks.constructEventAsync(
      rawBody,
      signature,
      secret,
    );

    // Pull normalized ids off the event object so business logic never has to
    // reach into Stripe-shaped payloads.
    const obj = event.data.object as {
      id?: string;
      payment_intent?: string | { id?: string };
    };
    const intentId =
      typeof obj.payment_intent === "string"
        ? obj.payment_intent
        : obj.payment_intent?.id;

    let sessionId: string | undefined;
    let paymentId: string | undefined;
    switch (event.type) {
      case "checkout.session.completed":
        sessionId = obj.id;
        paymentId = intentId;
        break;
      case "payment_intent.succeeded":
      case "payment_intent.payment_failed":
        paymentId = obj.id;
        break;
      case "charge.refunded":
      case "refund.updated":
        paymentId = intentId;
        break;
    }

    return {
      type: normalizeEventType(event.type),
      id: event.id,
      sessionId,
      paymentId,
      raw: event,
    };
  },
};
