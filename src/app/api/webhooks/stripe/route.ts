import { NextResponse } from "next/server";
import { getPaymentProvider } from "@/lib/payments";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  // IMPORTANT: read the RAW body before any parsing — signature verification
  // is computed over the exact bytes Stripe sent.
  const rawBody = await req.text();

  let event;
  try {
    event = await getPaymentProvider().verifyWebhook(rawBody, req.headers);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid webhook.";
    // 400 tells Stripe the signature/verification failed; it will not retry
    // a 400 indefinitely, and we don't want to ack an unverified payload.
    return NextResponse.json({ error: message }, { status: 400 });
  }

  // Handle the normalized event. Keep this fast and idempotent — return 2xx
  // quickly so the provider doesn't retry. Offload slow work with waitUntil.
  switch (event.type) {
    case "checkout.completed":
      // TODO: mark the order paid, trigger fulfillment / SignWell, etc.
      break;
    case "payment.succeeded":
      break;
    case "payment.failed":
      break;
    case "refund.updated":
      break;
    default:
      // Unrecognized events are acknowledged so the provider stops retrying.
      break;
  }

  return NextResponse.json({ received: true });
}
