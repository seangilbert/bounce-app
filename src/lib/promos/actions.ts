"use server";

import { getOperatorById } from "@/lib/inventory/repo";
import { operatorToday } from "@/lib/operator/time";
import { applyPromo } from "./repo";

export interface PromoPreview {
  ok: boolean;
  reason?: string;
  discountCents: number;
  code?: string;
}

/**
 * Validate a promo code against a subtotal for the storefront checkout / booking
 * builder. Returns the discount or a friendly reason. createBooking re-resolves
 * it authoritatively, so this is display-only.
 */
export async function previewPromoAction(input: {
  operatorId: string;
  code: string;
  subtotalCents: number;
}): Promise<PromoPreview> {
  const op = await getOperatorById(input.operatorId);
  if (!op) return { ok: false, reason: "That code isn't valid.", discountCents: 0 };
  const res = await applyPromo(input.operatorId, input.code, input.subtotalCents, operatorToday(op.timezone));
  return { ok: res.ok, reason: res.reason, discountCents: res.discountCents, code: res.code };
}
