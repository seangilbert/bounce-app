"use server";

import { revalidatePath } from "next/cache";
import { getSessionOperator } from "@/lib/operator/session";
import { getBooking, setBookingStatus, setBookingDeposit } from "@/lib/bookings/repo";
import { getOrderByBookingId, setOrderStatusByPaymentId } from "@/lib/orders/repo";
import { getPaymentProvider } from "@/lib/payments";
import type { Booking } from "@/lib/bookings/types";

export type ActionResult = { ok: true } | { ok: false; error: string };

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
  await setBookingDeposit(id, a.booking.total); // deposit = total → balance 0
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
    await setOrderStatusByPaymentId(order.provider, order.providerPaymentId, "refunded");
    await setBookingStatus(id, "canceled");
    revalidate(id);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Refund failed." };
  }
}
