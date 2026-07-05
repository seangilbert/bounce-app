import { NextResponse } from "next/server";
import { z } from "zod";
import { getPaymentProvider } from "@/lib/payments";
import type { CheckoutInput } from "@/lib/payments";
import { createPendingOrder } from "@/lib/orders/repo";
import { getBooking, setBookingStatus, setBookingDeposit } from "@/lib/bookings/repo";
import { checkRateLimit } from "@/lib/rate-limit";
import { DEPOSIT_PERCENT, depositAmount } from "@/lib/deposit";

export const dynamic = "force-dynamic";

// Per-IP rate limit — creating checkout sessions hits the provider's API.
const RATE_LIMIT = 20;
const RATE_WINDOW_MS = 60_000;

function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

// Two ways to check out: from a booking (preferred — line items come from the
// booking) or with raw lineItems (kept for direct/legacy callers).
const CheckoutSchema = z
  .object({
    successUrl: z.string().url(),
    cancelUrl: z.string().url(),
    bookingId: z.string().uuid().optional(),
    lineItems: z
      .array(
        z.object({
          name: z.string(),
          quantity: z.number().int().positive(),
          unitAmount: z.number().int().nonnegative(),
        }),
      )
      .min(1)
      .optional(),
    currency: z.string().default("usd"),
    customerEmail: z.string().email().optional(),
    metadata: z.record(z.string(), z.string()).optional(),
    // Booking checkouts can collect a deposit now (balance due on delivery) or
    // the full amount. Ignored for raw-lineItems checkouts.
    paymentType: z.enum(["deposit", "full"]).default("full"),
  })
  .refine((d) => d.bookingId || d.lineItems, {
    message: "Provide either bookingId or lineItems.",
  });

export async function POST(req: Request) {
  const rl = checkRateLimit(`checkout:${clientIp(req)}`, RATE_LIMIT, RATE_WINDOW_MS);
  if (!rl.allowed) {
    const retryAfter = Math.max(1, Math.ceil((rl.resetAt - Date.now()) / 1000));
    return NextResponse.json(
      { error: "Rate limit exceeded. Try again later." },
      { status: 429, headers: { "retry-after": String(retryAfter) } },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = CheckoutSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request.", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const data = parsed.data;

  // Resolve line items + metadata from either the booking or the raw payload.
  let checkoutInput: CheckoutInput;
  let bookingId: string | undefined;
  // Amount to record on the booking as collected up front (deposit, or full).
  let depositToRecord: number | null = null;

  if (data.bookingId) {
    const booking = await getBooking(data.bookingId);
    if (!booking) {
      return NextResponse.json({ error: "Booking not found." }, { status: 404 });
    }
    if (booking.status !== "quoted" && booking.status !== "pending_payment") {
      return NextResponse.json(
        { error: `Booking cannot be paid from status "${booking.status}".` },
        { status: 409 },
      );
    }
    bookingId = booking.id;

    // booking.subtotal is range-aware (line_total already applies the rental
    // duration). Charge either a deposit or the full amount.
    const subtotal = booking.subtotal;
    let lineItems;
    if (data.paymentType === "deposit") {
      const dep = depositAmount(subtotal);
      lineItems = [
        { name: `Deposit (${DEPOSIT_PERCENT}%) — balance due on delivery`, quantity: 1, unitAmount: dep },
      ];
      depositToRecord = dep;
    } else {
      // Per-unit for the whole rental = line_total / quantity (integer for our
      // pricing: unit_price × days). Charging this fixes the prior single-day bug.
      lineItems = booking.items.map((li) => ({
        name: li.name,
        quantity: li.quantity,
        unitAmount: Math.round(li.lineTotal / li.quantity),
      }));
      depositToRecord = subtotal; // paid in full
    }
    checkoutInput = {
      currency: booking.currency,
      successUrl: data.successUrl,
      cancelUrl: data.cancelUrl,
      customerEmail: booking.customerEmail ?? undefined,
      metadata: { booking_id: booking.id, payment_type: data.paymentType },
      lineItems,
    };
  } else {
    checkoutInput = {
      currency: data.currency,
      successUrl: data.successUrl,
      cancelUrl: data.cancelUrl,
      customerEmail: data.customerEmail,
      metadata: data.metadata,
      lineItems: data.lineItems!,
    };
  }

  try {
    const provider = getPaymentProvider();
    const result = await provider.createCheckout(checkoutInput);

    const amountTotal = checkoutInput.lineItems.reduce(
      (sum, li) => sum + li.quantity * li.unitAmount,
      0,
    );
    await createPendingOrder({
      provider: provider.name,
      providerSessionId: result.id,
      amountTotal,
      currency: checkoutInput.currency,
      customerEmail: checkoutInput.customerEmail ?? null,
      lineItems: checkoutInput.lineItems,
      metadata: checkoutInput.metadata,
      bookingId,
    });

    // Move the booking into checkout + record what's being collected up front.
    // (Still doesn't reserve inventory — that happens when payment is confirmed.)
    if (bookingId) {
      await setBookingStatus(bookingId, "pending_payment");
      if (depositToRecord != null) await setBookingDeposit(bookingId, depositToRecord);
    }

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error.";
    const status =
      message.includes("is not set") || message.includes("not implemented")
        ? 503
        : 502;
    return NextResponse.json({ error: message }, { status });
  }
}
