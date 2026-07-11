import { getESignatureProvider } from "./index";
import { setOrderEsignDocument } from "@/lib/orders/repo";
import { getBooking, setBookingStatus } from "@/lib/bookings/repo";
import { getOperatorById } from "@/lib/inventory/repo";
import type { Operator } from "@/lib/inventory/types";
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
  // Platform identity — used only as a fallback when we can't resolve the
  // operator (or they haven't set a contact email).
  const fallbackEmail = process.env.SIGNWELL_SENDER_EMAIL;
  const fallbackName = process.env.SIGNWELL_SENDER_NAME ?? "Bounce Party Rentals";
  if (!templateId) throw new Error("SIGNWELL_TEMPLATE_ID is not set.");
  if (!fallbackEmail) throw new Error("SIGNWELL_SENDER_EMAIL is not set.");
  if (!order.customerEmail) {
    console.warn(`[esign] order ${order.id} has no customer email; skipping agreement.`);
    return;
  }

  // Resolve the operator so the agreement is between the *operator* and their
  // customer — not the platform. Falls back to the platform identity if we can't
  // load the operator or they have no contact email on file.
  let operator: Operator | null = null;
  if (order.bookingId) {
    try {
      const booking = await getBooking(order.bookingId);
      operator = booking ? await getOperatorById(booking.operatorId) : null;
    } catch (e) {
      console.error("[esign] loading operator for agreement failed; using platform identity:", e);
    }
  }
  const companyName = operator?.esignSignerName?.trim() || operator?.name?.trim() || fallbackName;
  const companyEmail =
    operator?.esignSignerEmail?.trim() || operator?.contactEmail?.trim() || fallbackEmail;

  // Template merge fields — the operator's business identity + customer policies
  // printed in the document body. Gated behind SIGNWELL_TEMPLATE_FIELDS (legacy
  // alias: SIGNWELL_POLICY_FIELDS) because SignWell rejects an api_id the
  // template doesn't define; flip it on only once the template has these text
  // fields (api_ids: company_name / company_email / company_phone /
  // company_address / cancellation_policy / damage_policy).
  let fields: Record<string, string> | undefined;
  const mergeFields =
    process.env.SIGNWELL_TEMPLATE_FIELDS === "true" || process.env.SIGNWELL_POLICY_FIELDS === "true";
  if (mergeFields && operator) {
    const f: Record<string, string> = {};
    if (operator.name?.trim()) f.company_name = operator.name.trim();
    if (companyEmail) f.company_email = companyEmail;
    if (operator.phone?.trim()) f.company_phone = operator.phone.trim();
    if (operator.businessAddress?.trim()) f.company_address = operator.businessAddress.trim();
    if (operator.cancellationPolicy?.trim()) f.cancellation_policy = operator.cancellationPolicy.trim();
    if (operator.damagePolicy?.trim()) f.damage_policy = operator.damagePolicy.trim();
    if (Object.keys(f).length) fields = f;
  }

  // Signers. The customer ("Client") always signs. The company countersigner
  // ("Document Sender") is included unless single-signer (customer-only) mode is
  // on — set SIGNWELL_SINGLE_SIGNER=true once the template's Document Sender role
  // has no signature field, so only the customer is asked to sign.
  const singleSigner = process.env.SIGNWELL_SINGLE_SIGNER === "true";
  const recipients = [
    ...(singleSigner
      ? []
      : [{ id: "1", name: companyName, email: companyEmail, placeholderName: "Document Sender" }]),
    {
      id: "2",
      name: order.customerEmail,
      email: order.customerEmail,
      placeholderName: "Client",
    },
  ];

  const provider = getESignatureProvider();
  const doc = await provider.createFromTemplate({
    templateId,
    fields,
    // Live documents are billable + legally binding — opt in explicitly by
    // setting SIGNWELL_TEST_MODE=false. Anything else stays test mode.
    testMode: process.env.SIGNWELL_TEST_MODE !== "false",
    // Omit sendEmail entirely — SignWell emails the signer(s) by default (this
    // template isn't embedded-signing, which is the only mode send_email allows).
    recipients,
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
