import { NextResponse } from "next/server";
import { z } from "zod";
import { getPaymentProvider } from "@/lib/payments";
import type { CheckoutInput } from "@/lib/payments";
import { createPendingOrder } from "@/lib/orders/repo";
import { getBooking, reserveBooking, setBookingDeposit } from "@/lib/bookings/repo";
import { getOperatorById } from "@/lib/inventory/repo";
import { checkRateLimit } from "@/lib/rate-limit";
import { DEPOSIT_PERCENT, depositAmount } from "@/lib/deposit";

/** Optional platform fee on connected-account charges, in basis points (0 = none). */
const PLATFORM_FEE_BPS = Number(process.env.PLATFORM_FEE_BPS ?? 0);

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
    // Booking checkouts collect a deposit, the full amount, or the remaining
    // balance (operator-initiated). Ignored for raw-lineItems checkouts.
    paymentType: z.enum(["deposit", "full", "balance"]).default("full"),
  })
  .refine((d) => d.bookingId || d.lineItems, {
    message: "Provide either bookingId or lineItems.",
  });

export async function POST(req: Request) {
  const rl = await checkRateLimit(`checkout:${clientIp(req)}`, RATE_LIMIT, RATE_WINDOW_MS);
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
    // Deposit/full pay a fresh quote; balance is collected on an already-paid
    // booking, so it allows the committed statuses instead.
    const okStatuses =
      data.paymentType === "balance"
        ? ["paid", "contracted", "confirmed", "delivered"]
        : ["quoted", "pending_payment"];
    if (!okStatuses.includes(booking.status)) {
      return NextResponse.json(
        { error: `Booking cannot be charged from status "${booking.status}".` },
        { status: 409 },
      );
    }
    bookingId = booking.id;
    const operator = await getOperatorById(booking.operatorId);
    const depositPct = operator?.depositPercent ?? DEPOSIT_PERCENT;

    // booking.total = range-aware subtotal + delivery + tax. Charge either a
    // deposit (% of total) or the full amount (itemized + delivery + tax).
    const total = booking.total;
    let lineItems;
    if (data.paymentType === "balance") {
      const bal = total - (booking.deposit ?? 0);
      if (bal <= 0) return NextResponse.json({ error: "No balance due." }, { status: 400 });
      lineItems = [
        { name: `Balance — booking #${booking.id.slice(0, 8).toUpperCase()}`, quantity: 1, unitAmount: bal },
      ];
      depositToRecord = null; // deposit becomes the total on completion (webhook)
    } else if (data.paymentType === "deposit") {
      const dep = depositAmount(total, depositPct);
      lineItems = [
        { name: `Deposit (${depositPct}%) — balance due on delivery`, quantity: 1, unitAmount: dep },
      ];
      depositToRecord = dep;
    } else if (booking.discount > 0) {
      // Stripe line items can't be negative, so a discounted booking is charged
      // as a single total line (the itemized breakdown lives in the app / email).
      lineItems = [
        { name: `Booking #${booking.id.slice(0, 8).toUpperCase()} (incl. discount)`, quantity: 1, unitAmount: total },
      ];
      depositToRecord = total; // paid in full
    } else {
      // Per-unit for the whole rental = line_total / quantity (integer for our
      // pricing: unit_price × days), plus delivery + tax as their own lines.
      lineItems = [
        ...booking.items.map((li) => ({
          name: li.name,
          quantity: li.quantity,
          unitAmount: Math.round(li.lineTotal / li.quantity),
        })),
        ...(booking.deliveryFee > 0
          ? [{ name: "Delivery", quantity: 1, unitAmount: booking.deliveryFee }]
          : []),
        ...(booking.taxAmount > 0
          ? [{ name: "Sales tax", quantity: 1, unitAmount: booking.taxAmount }]
          : []),
      ];
      depositToRecord = total; // paid in full
    }

    // Stripe Connect: if this booking's operator has connected their Stripe
    // account, route the funds to them (destination charge). Otherwise the
    // charge stays on the platform account (single-tenant / not-yet-connected).
    const chargedAmount = lineItems.reduce((s, li) => s + li.quantity * li.unitAmount, 0);
    const connect =
      operator?.stripeConnectId && operator.connectChargesEnabled
        ? {
            transferDestination: operator.stripeConnectId,
            ...(PLATFORM_FEE_BPS > 0
              ? { applicationFeeAmount: Math.round((chargedAmount * PLATFORM_FEE_BPS) / 10000) }
              : {}),
          }
        : {};

    checkoutInput = {
      currency: booking.currency,
      successUrl: data.successUrl,
      cancelUrl: data.cancelUrl,
      customerEmail: booking.customerEmail ?? undefined,
      metadata: { booking_id: booking.id, payment_type: data.paymentType },
      lineItems,
      ...connect,
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
    // Atomically reserve inventory BEFORE creating the payment session, so two
    // simultaneous checkouts for the last unit can't both go through. Balance
    // charges are on an already-reserved booking, so they skip this.
    if (bookingId && data.paymentType !== "balance") {
      const reserved = await reserveBooking(bookingId);
      if (!reserved.ok) {
        return NextResponse.json(
          { error: "Sorry — those dates just sold out. Please choose another date." },
          { status: 409 },
        );
      }
    }

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

    // Record what's being collected up front. The booking is already reserved +
    // in pending_payment (reserveBooking above) for deposit/full payments.
    if (bookingId && depositToRecord != null) {
      await setBookingDeposit(bookingId, depositToRecord);
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
