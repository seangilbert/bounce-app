import { createAdminClient } from "@/utils/supabase/admin";
import type { PaymentProviderName } from "@/lib/payments";
import type { NewOrder, Order, OrderStatus } from "./types";

const ORDERS = "orders";
const EVENTS = "processed_webhook_events";

/** Raw `orders` row shape (snake_case) as returned by Supabase. */
interface OrderRow {
  id: string;
  created_at: string;
  updated_at: string;
  status: OrderStatus;
  provider: PaymentProviderName;
  provider_session_id: string;
  provider_payment_id: string | null;
  amount_total: number;
  currency: string;
  customer_email: string | null;
  line_items: Order["lineItems"];
  metadata: Record<string, string>;
  booking_id: string | null;
  esign_document_id: string | null;
  esign_status: string | null;
}

function rowToOrder(row: OrderRow): Order {
  return {
    id: row.id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    status: row.status,
    provider: row.provider,
    providerSessionId: row.provider_session_id,
    providerPaymentId: row.provider_payment_id,
    amountTotal: row.amount_total,
    currency: row.currency,
    customerEmail: row.customer_email,
    lineItems: row.line_items ?? [],
    metadata: row.metadata ?? {},
    bookingId: row.booking_id,
    esignDocumentId: row.esign_document_id,
    esignStatus: row.esign_status,
  };
}

/** Create a pending order for a freshly-created checkout session. */
export async function createPendingOrder(input: NewOrder): Promise<Order> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from(ORDERS)
    .insert({
      status: "pending",
      provider: input.provider,
      provider_session_id: input.providerSessionId,
      amount_total: input.amountTotal,
      currency: input.currency,
      customer_email: input.customerEmail ?? null,
      line_items: input.lineItems,
      metadata: input.metadata ?? {},
      booking_id: input.bookingId ?? null,
    })
    .select()
    .single();

  if (error) throw new Error(`createPendingOrder failed: ${error.message}`);
  return rowToOrder(data as OrderRow);
}

/** Look up an order by its provider checkout-session id. */
export async function getOrderBySessionId(
  provider: PaymentProviderName,
  providerSessionId: string,
): Promise<Order | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from(ORDERS)
    .select()
    .eq("provider", provider)
    .eq("provider_session_id", providerSessionId)
    .maybeSingle();

  if (error) throw new Error(`getOrderBySessionId failed: ${error.message}`);
  return data ? rowToOrder(data as OrderRow) : null;
}

/** The most recent order for a booking (used for payment status + refunds). */
export async function getOrderByBookingId(bookingId: string): Promise<Order | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from(ORDERS)
    .select()
    .eq("booking_id", bookingId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`getOrderByBookingId failed: ${error.message}`);
  return data ? rowToOrder(data as OrderRow) : null;
}

/**
 * Transition the order for a checkout session to a terminal status.
 * Returns the updated order, or null if no order matched that session.
 */
export async function setOrderStatusBySessionId(
  provider: PaymentProviderName,
  providerSessionId: string,
  status: Exclude<OrderStatus, "pending">,
  providerPaymentId?: string | null,
): Promise<Order | null> {
  const supabase = createAdminClient();
  const patch: Record<string, unknown> = { status };
  if (providerPaymentId !== undefined) patch.provider_payment_id = providerPaymentId;

  const { data, error } = await supabase
    .from(ORDERS)
    .update(patch)
    .eq("provider", provider)
    .eq("provider_session_id", providerSessionId)
    .select()
    .maybeSingle();

  if (error) throw new Error(`setOrderStatusBySessionId failed: ${error.message}`);
  return data ? rowToOrder(data as OrderRow) : null;
}

/**
 * Transition the order for a given provider payment/intent id to a terminal
 * status (used for refunds, which reference the payment, not the session).
 * Returns the updated order, or null if no order matched.
 */
export async function setOrderStatusByPaymentId(
  provider: PaymentProviderName,
  providerPaymentId: string,
  status: Exclude<OrderStatus, "pending">,
): Promise<Order | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from(ORDERS)
    .update({ status })
    .eq("provider", provider)
    .eq("provider_payment_id", providerPaymentId)
    .select()
    .maybeSingle();

  if (error) throw new Error(`setOrderStatusByPaymentId failed: ${error.message}`);
  return data ? rowToOrder(data as OrderRow) : null;
}

/** Record the agreement document created for an order. */
export async function setOrderEsignDocument(
  orderId: string,
  esignDocumentId: string,
  esignStatus: string,
): Promise<void> {
  const supabase = createAdminClient();
  const { error } = await supabase
    .from(ORDERS)
    .update({ esign_document_id: esignDocumentId, esign_status: esignStatus })
    .eq("id", orderId);
  if (error) throw new Error(`setOrderEsignDocument failed: ${error.message}`);
}

/**
 * Update the signing status of the order tied to an agreement document.
 * Returns the updated order, or null if no order references that document.
 */
export async function setEsignStatusByDocumentId(
  esignDocumentId: string,
  esignStatus: string,
): Promise<Order | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from(ORDERS)
    .update({ esign_status: esignStatus })
    .eq("esign_document_id", esignDocumentId)
    .select()
    .maybeSingle();
  if (error) throw new Error(`setEsignStatusByDocumentId failed: ${error.message}`);
  return data ? rowToOrder(data as OrderRow) : null;
}

/**
 * Atomically claim a webhook event for processing.
 *
 * Returns true if this is the first time we've seen (provider, eventId) — the
 * caller should proceed. Returns false if it was already processed (duplicate
 * delivery) — the caller should skip. Relies on the primary-key conflict, so
 * the claim is race-free even across concurrent deliveries.
 */
export async function claimWebhookEvent(
  provider: PaymentProviderName,
  eventId: string,
): Promise<boolean> {
  const supabase = createAdminClient();
  const { error } = await supabase
    .from(EVENTS)
    .insert({ provider, event_id: eventId });

  if (!error) return true;
  // 23505 = unique_violation → already claimed/processed.
  if ((error as { code?: string }).code === "23505") return false;
  throw new Error(`claimWebhookEvent failed: ${error.message}`);
}

/**
 * Release a previously-claimed event so a later delivery re-processes it.
 * Call this if processing fails after the claim, so the provider's retry is
 * not silently skipped as a duplicate.
 */
export async function releaseWebhookEvent(
  provider: PaymentProviderName,
  eventId: string,
): Promise<void> {
  const supabase = createAdminClient();
  const { error } = await supabase
    .from(EVENTS)
    .delete()
    .eq("provider", provider)
    .eq("event_id", eventId);
  if (error) throw new Error(`releaseWebhookEvent failed: ${error.message}`);
}
