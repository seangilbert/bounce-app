"use server";

import { createAdminClient } from "@/utils/supabase/admin";
import { getOperatorById } from "@/lib/inventory/repo";
import { operatorToday } from "@/lib/operator/time";
import { resolveBookingDiscount, type AppliedKind } from "./repo";

export interface DiscountPreview {
  discountCents: number;
  label: string;
  appliedKind: AppliedKind;
  /** Set when a typed code didn't apply. */
  codeReason?: string;
}

/** Whether a customer (by email) already has a committed booking with this operator. */
async function hasPriorBooking(operatorId: string, email?: string | null): Promise<boolean> {
  const clean = email?.trim().toLowerCase();
  if (!clean) return false;
  const supabase = createAdminClient();
  const { data: cust } = await supabase
    .from("customers")
    .select("id")
    .eq("operator_id", operatorId)
    .eq("email", clean)
    .maybeSingle();
  if (!cust) return false;
  const { data } = await supabase
    .from("bookings")
    .select("id")
    .eq("operator_id", operatorId)
    .eq("customer_id", cust.id)
    .in("status", ["paid", "contracted", "confirmed", "delivered", "completed"])
    .limit(1);
  return !!(data && data.length);
}

/**
 * Preview the best discount for the checkout/builder: a typed code plus any
 * applicable automatic promo (weekday / repeat customer). createBooking
 * re-resolves this authoritatively, so it's display-only.
 */
export async function resolveDiscountPreviewAction(input: {
  operatorId: string;
  code?: string | null;
  subtotalCents: number;
  startDate: string;
  customerEmail?: string | null;
}): Promise<DiscountPreview> {
  const op = await getOperatorById(input.operatorId);
  if (!op) return { discountCents: 0, label: "", appliedKind: null };
  const customerHasPrior = await hasPriorBooking(input.operatorId, input.customerEmail);
  const res = await resolveBookingDiscount(input.operatorId, {
    code: input.code,
    subtotalCents: input.subtotalCents,
    startDate: input.startDate,
    customerHasPrior,
    today: operatorToday(op.timezone),
  });
  return { discountCents: res.discountCents, label: res.label, appliedKind: res.appliedKind, codeReason: res.codeReason };
}
