/**
 * Provider-agnostic payment types.
 *
 * Business logic depends only on these — never on Stripe or Square directly —
 * so the active processor can be swapped via the PAYMENT_PROVIDER env var
 * without touching call sites.
 */

/** An amount in the currency's minor units (e.g. cents), with ISO currency. */
export interface Money {
  /** Minor units — 1000 = $10.00 USD. */
  amount: number;
  /** ISO 4217 currency code, e.g. "usd". */
  currency: string;
}

export interface LineItem {
  name: string;
  quantity: number;
  /** Per-unit price in minor units. */
  unitAmount: number;
}

export interface CheckoutInput {
  lineItems: LineItem[];
  /** ISO 4217 currency code, e.g. "usd". */
  currency: string;
  /** Where the provider redirects after a successful payment. */
  successUrl: string;
  /** Where the provider redirects if the customer cancels. */
  cancelUrl: string;
  customerEmail?: string;
  /** Arbitrary key/value data echoed back on webhook events. */
  metadata?: Record<string, string>;
}

export interface CheckoutResult {
  /** Provider-native session/intent id. */
  id: string;
  /** Hosted checkout URL to redirect the customer to. */
  url: string;
}

export interface RefundResult {
  id: string;
  status: string;
}

/** Normalized webhook event kinds we care about across providers. */
export type PaymentEventType =
  | "checkout.completed"
  | "payment.succeeded"
  | "payment.failed"
  | "refund.updated"
  | "unknown";

export interface PaymentEvent {
  type: PaymentEventType;
  /** Provider-native event id. */
  id: string;
  /** The provider-native event object, for handlers needing full detail. */
  raw: unknown;
}

export type PaymentProviderName = "stripe" | "square";

export interface PaymentProvider {
  readonly name: PaymentProviderName;

  /** Create a hosted checkout session and return its redirect URL. */
  createCheckout(input: CheckoutInput): Promise<CheckoutResult>;

  /** Refund a payment in full, or partially if `amount` is given. */
  refund(paymentId: string, amount?: Money): Promise<RefundResult>;

  /**
   * Verify a webhook's signature against the RAW request body and return a
   * normalized event. Throws if the signature is invalid.
   */
  verifyWebhook(rawBody: string, headers: Headers): Promise<PaymentEvent>;
}
