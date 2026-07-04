import type { PaymentProviderName } from "@/lib/payments";

export type OrderStatus = "pending" | "paid" | "failed" | "refunded";

/** A line on an order. Amounts are minor units (cents), per the payment layer. */
export interface OrderLineItem {
  name: string;
  quantity: number;
  unitAmount: number;
}

/** An order as stored — camelCase mirror of the `orders` table row. */
export interface Order {
  id: string;
  createdAt: string;
  updatedAt: string;
  status: OrderStatus;
  provider: PaymentProviderName;
  /** Provider checkout-session id (e.g. Stripe `cs_...`). */
  providerSessionId: string;
  /** Provider payment/intent id — null until the order is paid. */
  providerPaymentId: string | null;
  /** Order total in minor units. */
  amountTotal: number;
  currency: string;
  customerEmail: string | null;
  lineItems: OrderLineItem[];
  metadata: Record<string, string>;
}

/** Fields needed to open a new pending order at checkout time. */
export interface NewOrder {
  provider: PaymentProviderName;
  providerSessionId: string;
  amountTotal: number;
  currency: string;
  customerEmail?: string | null;
  lineItems: OrderLineItem[];
  metadata?: Record<string, string>;
}
