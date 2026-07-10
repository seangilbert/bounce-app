"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getSessionOperator } from "@/lib/operator/session";
import {
  getBooking,
  setBookingStatus,
  setBookingDeposit,
  createBooking,
  reserveBooking,
  setBookingLoadout,
  setBookingTurnaround,
} from "@/lib/bookings/repo";
import { getOrderByBookingId, setOrderStatusByPaymentId, recordCashPayment } from "@/lib/orders/repo";
import { getPaymentProvider, type PaymentProviderName } from "@/lib/payments";
import { linkInquiryToBooking } from "@/lib/inquiries/repo";
import { notifyQuoteLink } from "@/lib/email";
import { depositAmount } from "@/lib/deposit";
import { toE164US } from "@/lib/phone";
import type { Booking } from "@/lib/bookings/types";

export type ActionResult = { ok: true } | { ok: false; error: string };

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const NewBookingInput = z
  .object({
    mode: z.enum(["link", "manual"]),
    paymentType: z.enum(["deposit", "full"]).default("deposit"),
    customerName: z.string().trim().min(1, "Customer name is required.").max(120),
    customerEmail: z.string().email("A valid email is required."),
    customerPhone: z.string().trim().max(40).optional(),
    deliveryAddress: z.string().trim().max(200).optional(),
    deliveryZip: z.string().trim().max(20).optional(),
    startDate: z.string().regex(ISO, "Pick a start date."),
    endDate: z.string().regex(ISO, "Pick an end date."),
    items: z
      .array(z.object({ itemId: z.string().uuid(), quantity: z.number().int().positive() }))
      .min(1, "Add at least one item."),
    message: z.string().trim().max(2000).optional(),
    inquiryId: z.string().uuid().optional(),
    depositCents: z.number().int().min(0).optional(),
    deliveryFeeOverrideCents: z.number().int().min(0).optional(),
  })
  .refine((d) => d.endDate >= d.startDate, { message: "End date must be on or after the start date." });

/**
 * Operator-created booking. Two modes:
 *  - "link": create a quote + email the customer a /pay/[id] link (they pay
 *    online → the existing webhook reserves + confirms + sends the contract).
 *  - "manual": reserve + confirm immediately (cash/phone order), optional deposit.
 * Links to the originating inquiry when provided so its outcome updates.
 */
export async function createOperatorBookingAction(
  input: unknown,
): Promise<{ ok: true; bookingId: string; payUrl?: string } | { ok: false; error: string }> {
  const op = await getSessionOperator();
  if (!op) return { ok: false, error: "Not signed in." };
  const parsed = NewBookingInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid booking." };
  const d = parsed.data;

  const phone = d.customerPhone ? toE164US(d.customerPhone) ?? d.customerPhone : null;

  try {
    const booking = await createBooking({
      operatorId: op.id,
      startDate: d.startDate,
      endDate: d.endDate,
      items: d.items,
      customerName: d.customerName,
      customerEmail: d.customerEmail,
      customerPhone: phone,
      deliveryAddress: d.deliveryAddress ?? null,
      deliveryZip: d.deliveryZip ?? null,
      deliveryFeeOverrideCents: d.deliveryFeeOverrideCents ?? null,
      skipAvailabilityCheck: true, // operators can book their own off-days
    });

    if (d.inquiryId) {
      try {
        await linkInquiryToBooking(op.id, d.inquiryId, booking.id, {
          email: d.customerEmail,
          phone,
          name: d.customerName,
        });
      } catch (err) {
        console.error("[bookings] linkInquiryToBooking failed:", err);
      }
    }

    if (d.mode === "manual") {
      const reserved = await reserveBooking(booking.id);
      if (!reserved.ok) return { ok: false, error: "Not enough inventory for those dates." };
      await setBookingStatus(booking.id, "confirmed");
      if (d.depositCents && d.depositCents > 0) {
        await setBookingDeposit(booking.id, d.depositCents);
        // Recorded cash deposit → show it in payment history + "Collected".
        try {
          await recordCashPayment({
            bookingId: booking.id,
            amountCents: d.depositCents,
            paymentType: d.depositCents >= booking.total ? "full" : "deposit",
            customerEmail: d.customerEmail,
          });
        } catch (e) {
          console.error("[orders] recordCashPayment (manual deposit) failed:", e);
        }
      }
      revalidatePath("/calendar");
      revalidatePath("/dashboard");
      revalidatePath("/deliveries");
      revalidatePath("/inquiries");
      return { ok: true, bookingId: booking.id };
    }

    // link mode — email the customer a pay link (nothing is reserved until they pay).
    const base = process.env.NEXT_PUBLIC_APP_URL ?? "https://bounce-app.vercel.app";
    const payUrl = `${base}/pay/${booking.id}?type=${d.paymentType}`;
    try {
      await notifyQuoteLink(booking, op, payUrl, depositAmount(booking.total, op.depositPercent), d.message);
    } catch (err) {
      console.error("[bookings] quote email failed:", err);
    }
    revalidatePath("/inquiries");
    revalidatePath("/dashboard");
    return { ok: true, bookingId: booking.id, payUrl };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not create the booking." };
  }
}

/** Load the booking and confirm it belongs to the signed-in operator. */
async function authorize(id: string): Promise<{ booking: Booking } | { error: string }> {
  const op = await getSessionOperator();
  if (!op) return { error: "Not signed in." };
  const booking = await getBooking(id);
  if (!booking || booking.operatorId !== op.id) return { error: "Booking not found." };
  return { booking };
}

function revalidate(id: string) {
  revalidatePath(`/bookings/${id}`);
  revalidatePath("/calendar");
  revalidatePath("/dashboard");
  revalidatePath("/deliveries");
}

export async function markDeliveredAction(id: string): Promise<ActionResult> {
  const a = await authorize(id);
  if ("error" in a) return { ok: false, error: a.error };
  await setBookingStatus(id, "delivered");
  revalidate(id);
  return { ok: true };
}

export async function markCompletedAction(id: string): Promise<ActionResult> {
  const a = await authorize(id);
  if ("error" in a) return { ok: false, error: a.error };
  await setBookingStatus(id, "completed");
  revalidate(id);
  return { ok: true };
}

/** Persist which loadout items are checked off for a booking (deliveries screen). */
export async function setBookingLoadoutAction(id: string, labels: string[]): Promise<ActionResult> {
  const a = await authorize(id);
  if ("error" in a) return { ok: false, error: a.error };
  const clean = Array.isArray(labels) ? labels.map((l) => String(l).slice(0, 60)).slice(0, 40) : [];
  try {
    await setBookingLoadout(id, clean);
    revalidatePath("/deliveries");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not save loadout." };
  }
}

/**
 * Mark a pickup returned (booking completed). When `needsCleaning`, the returned
 * units are moved into each item's needs-cleaning pool so they're held out of
 * availability until cleaned.
 */
export async function markReturnedAction(id: string, needsCleaning: boolean): Promise<ActionResult> {
  const a = await authorize(id);
  if ("error" in a) return { ok: false, error: a.error };
  try {
    await setBookingStatus(id, "completed");
    if (needsCleaning) await setBookingTurnaround(id, "needs_cleaning");
    revalidate(id);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not mark returned." };
  }
}

/** Mark a returned booking's units cleaned — frees them back into availability. */
export async function markCleanedAction(id: string): Promise<ActionResult> {
  const a = await authorize(id);
  if ("error" in a) return { ok: false, error: a.error };
  try {
    await setBookingTurnaround(id, "clean");
    revalidate(id);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not mark cleaned." };
  }
}

export async function cancelBookingAction(id: string): Promise<ActionResult> {
  const a = await authorize(id);
  if ("error" in a) return { ok: false, error: a.error };
  await setBookingStatus(id, "canceled"); // frees inventory (canceled doesn't reserve)
  revalidate(id);
  return { ok: true };
}

/** Record the remaining balance as collected (e.g. cash on delivery). */
export async function markBalancePaidAction(id: string): Promise<ActionResult> {
  const a = await authorize(id);
  if ("error" in a) return { ok: false, error: a.error };
  const balance = a.booking.total - (a.booking.deposit ?? 0);
  await setBookingDeposit(id, a.booking.total); // deposit = total → balance 0
  // Record the cash balance as a paid order so it shows in payment history +
  // counts toward "Collected" (best-effort — never fail the mark on this).
  try {
    await recordCashPayment({
      bookingId: id,
      amountCents: balance,
      paymentType: "balance",
      customerEmail: a.booking.customerEmail,
    });
  } catch (e) {
    console.error("[orders] recordCashPayment (balance) failed:", e);
  }
  revalidate(id);
  return { ok: true };
}

/** Refund the captured payment (deposit or full) and cancel the booking. */
export async function refundBookingAction(id: string): Promise<ActionResult> {
  const a = await authorize(id);
  if ("error" in a) return { ok: false, error: a.error };
  const order = await getOrderByBookingId(id);
  if (!order || order.status !== "paid" || !order.providerPaymentId) {
    return { ok: false, error: "No captured payment to refund." };
  }
  try {
    await getPaymentProvider().refund(order.providerPaymentId);
    // getOrderByBookingId excludes cash, so this is a real payment provider.
    await setOrderStatusByPaymentId(order.provider as PaymentProviderName, order.providerPaymentId, "refunded");
    await setBookingStatus(id, "canceled");
    revalidate(id);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Refund failed." };
  }
}
