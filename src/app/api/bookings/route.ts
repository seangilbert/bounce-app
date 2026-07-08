import { NextResponse } from "next/server";
import { z } from "zod";
import { getDefaultOperator, getOperatorById } from "@/lib/inventory/repo";
import { checkAvailability } from "@/lib/inventory/availability";
import { createBooking } from "@/lib/bookings/repo";
import { linkInquiryToBooking } from "@/lib/inquiries/repo";
import { expireStaleCheckouts } from "@/lib/bookings/expire";
import { checkRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const RATE_LIMIT = 20;
const RATE_WINDOW_MS = 60_000;

function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const BookingSchema = z
  .object({
    startDate: z.string().regex(ISO_DATE, "Expected YYYY-MM-DD"),
    // Optional — omit for a single-day rental (endDate defaults to startDate).
    endDate: z.string().regex(ISO_DATE, "Expected YYYY-MM-DD").optional(),
    items: z
      .array(z.object({ itemId: z.string().uuid(), quantity: z.number().int().positive() }))
      .min(1),
    customerName: z.string().optional(),
    customerEmail: z.string().email().optional(),
    customerPhone: z.string().max(40).optional(),
    inquiryId: z.string().uuid().optional(),
    deliveryWindow: z.string().optional(),
    deliveryAddress: z.string().optional(),
    deliveryZip: z.string().optional(),
    notes: z.string().optional(),
    operatorId: z.string().uuid().optional(),
  })
  .refine((d) => !d.endDate || d.endDate >= d.startDate, {
    message: "endDate must be on or after startDate.",
    path: ["endDate"],
  });

export async function POST(req: Request) {
  const rl = checkRateLimit(`bookings:${clientIp(req)}`, RATE_LIMIT, RATE_WINDOW_MS);
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

  const parsed = BookingSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request.", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const input = parsed.data;
  const startDate = input.startDate;
  const endDate = input.endDate ?? input.startDate;

  try {
    const operator = input.operatorId
      ? await getOperatorById(input.operatorId)
      : await getDefaultOperator();
    if (!operator) {
      return NextResponse.json({ error: "Storefront not found." }, { status: 404 });
    }

    // Free up any abandoned checkouts before checking availability.
    await expireStaleCheckouts();

    // Enforce availability across the whole range before quoting. A quote
    // doesn't reserve, but we won't quote something we can't fulfill.
    const unavailable: { itemId: string; requested: number; available: number }[] = [];
    for (const sel of input.items) {
      const a = await checkAvailability(sel.itemId, startDate, endDate, sel.quantity);
      if (!a.ok) {
        unavailable.push({ itemId: sel.itemId, requested: sel.quantity, available: a.available });
      }
    }
    if (unavailable.length) {
      return NextResponse.json(
        { error: "Some items are not available for those dates.", unavailable },
        { status: 409 },
      );
    }

    const booking = await createBooking({
      operatorId: operator.id,
      startDate,
      endDate,
      items: input.items,
      customerName: input.customerName,
      customerEmail: input.customerEmail,
      customerPhone: input.customerPhone,
      deliveryWindow: input.deliveryWindow,
      deliveryAddress: input.deliveryAddress,
      deliveryZip: input.deliveryZip,
      notes: input.notes,
    });

    // Tie the originating inquiry (if this came from the chat quote) to the
    // booking, so the inbox can show the outcome. Best-effort.
    if (input.inquiryId) {
      try {
        await linkInquiryToBooking(operator.id, input.inquiryId, booking.id);
      } catch (err) {
        console.error("[bookings] linkInquiryToBooking failed:", err);
      }
    }

    return NextResponse.json({ booking }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error.";
    // Client errors (bad item, wrong operator) → 400; anything else → 500.
    const clientError = /not found|does not belong|not available|Invalid quantity/.test(message);
    return NextResponse.json({ error: message }, { status: clientError ? 400 : 500 });
  }
}
