import { getESignatureProvider } from "./index";
import { setOrderEsignDocument } from "@/lib/orders/repo";
import { getBooking, setBookingStatus } from "@/lib/bookings/repo";
import { getOperatorById } from "@/lib/inventory/repo";
import type { Order } from "@/lib/orders/types";

/**
 * Whether paid orders should auto-send a signing agreement. Gated so the
 * behavior stays optional/flexible — on only when SIGNWELL_AUTO_SEND=true and
 * the template + company countersigner are configured.
 */
export function autoSendEnabled(): boolean {
  return (
    process.env.SIGNWELL_AUTO_SEND === "true" &&
    !!process.env.SIGNWELL_TEMPLATE_ID &&
    !!process.env.SIGNWELL_SENDER_EMAIL
  );
}

/**
 * Create and send the rental agreement for a paid order, then record the
 * document id/status on the order.
 *
 * Idempotent at the call site: skip if the order already has a document
 * (`order.esignDocumentId`). Returns without sending if the order has no
 * customer email to address the agreement to.
 */
export async function sendAgreementForOrder(order: Order): Promise<void> {
  const templateId = process.env.SIGNWELL_TEMPLATE_ID;
  const senderEmail = process.env.SIGNWELL_SENDER_EMAIL;
  const senderName = process.env.SIGNWELL_SENDER_NAME ?? "Bounce Party Rentals";
  if (!templateId) throw new Error("SIGNWELL_TEMPLATE_ID is not set.");
  if (!senderEmail) throw new Error("SIGNWELL_SENDER_EMAIL is not set.");
  if (!order.customerEmail) {
    console.warn(`[esign] order ${order.id} has no customer email; skipping agreement.`);
    return;
  }

  // Merge the operator's customer policies into the agreement, but only when the
  // template actually has matching text fields (api_ids `cancellation_policy` /
  // `damage_policy`) — opt in with SIGNWELL_POLICY_FIELDS=true. Off by default so
  // sends never break on a template that lacks the fields.
  let fields: Record<string, string> | undefined;
  if (process.env.SIGNWELL_POLICY_FIELDS === "true" && order.bookingId) {
    try {
      const booking = await getBooking(order.bookingId);
      const operator = booking ? await getOperatorById(booking.operatorId) : null;
      const f: Record<string, string> = {};
      if (operator?.cancellationPolicy?.trim()) f.cancellation_policy = operator.cancellationPolicy.trim();
      if (operator?.damagePolicy?.trim()) f.damage_policy = operator.damagePolicy.trim();
      if (Object.keys(f).length) fields = f;
    } catch (e) {
      console.error("[esign] loading policy fields failed; sending without them:", e);
    }
  }

  const provider = getESignatureProvider();
  const doc = await provider.createFromTemplate({
    templateId,
    fields,
    // Live documents are billable + legally binding — opt in explicitly by
    // setting SIGNWELL_TEST_MODE=false. Anything else stays test mode.
    testMode: process.env.SIGNWELL_TEST_MODE !== "false",
    // The rental template has two signer roles: the company countersigner
    // ("Document Sender") and the customer ("Client").
    // Omit sendEmail entirely — SignWell emails both signers by default (this
    // template isn't embedded-signing, which is the only mode send_email allows).
    recipients: [
      {
        id: "1",
        name: senderName,
        email: senderEmail,
        placeholderName: "Document Sender",
      },
      {
        id: "2",
        name: order.customerEmail,
        email: order.customerEmail,
        placeholderName: "Client",
      },
    ],
    // Links webhook events back to this order/booking (data.object.metadata).
    metadata: {
      order_id: order.id,
      ...(order.bookingId ? { booking_id: order.bookingId } : {}),
    },
  });

  await setOrderEsignDocument(order.id, doc.id, "sent");
  // Agreement is out for signature.
  if (order.bookingId) await setBookingStatus(order.bookingId, "contracted");
}
