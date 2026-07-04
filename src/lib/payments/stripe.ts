import Stripe from "stripe";
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
    return { type: normalizeEventType(event.type), id: event.id, raw: event };
  },
};
