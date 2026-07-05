import { NextResponse } from "next/server";
import { getESignatureProvider } from "@/lib/esign";
import { setEsignStatusByDocumentId } from "@/lib/orders/repo";
import { setBookingStatus } from "@/lib/bookings/repo";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  // Read the RAW body before parsing — the webhook JSON must be parsed exactly
  // as sent so the event fields used for signature verification are intact.
  const rawBody = await req.text();

  let event;
  try {
    event = await getESignatureProvider().verifyWebhook(rawBody, req.headers);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid webhook.";
    // 400 → verification failed; don't ack an unverified payload.
    return NextResponse.json({ error: message }, { status: 400 });
  }

  // Reflect the signing lifecycle onto the linked order. Idempotent — setting
  // the same status twice is harmless, so duplicate deliveries are safe.
  const lifecycle: Record<string, string> = {
    viewed: "viewed",
    signed: "signed",
    completed: "completed",
    declined: "declined",
    expired: "expired",
    canceled: "canceled",
  };
  const status = lifecycle[event.type];

  if (status && event.documentId) {
    try {
      const order = await setEsignStatusByDocumentId(event.documentId, status);
      if (!order) {
        console.warn(
          `[signwell] no order for document ${event.documentId} (event ${event.type})`,
        );
      } else if (order.bookingId && event.type === "completed") {
        // Both parties signed → the booking is confirmed.
        await setBookingStatus(order.bookingId, "confirmed");
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "handler error";
      // 500 so SignWell retries rather than dropping the status update.
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }

  return NextResponse.json({ received: true });
}
