import { getESignatureProvider } from "./index";
import { setOrderEsignDocument } from "@/lib/orders/repo";
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

  const provider = getESignatureProvider();
  const doc = await provider.createFromTemplate({
    templateId,
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
    // Links webhook events back to this order (data.object.metadata.order_id).
    metadata: { order_id: order.id },
  });

  await setOrderEsignDocument(order.id, doc.id, "sent");
}
