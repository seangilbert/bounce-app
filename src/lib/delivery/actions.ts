"use server";

import { createAdminClient } from "@/utils/supabase/admin";
import { resolveOperatorDeliveryFee } from "./resolve";
import type { DeliveryMode } from "./pricing";

export interface DeliveryFeePreview {
  feeCents: number | null;
  outOfArea: boolean;
  needsLocation: boolean;
  label?: string;
}

/**
 * Preview the delivery fee for a destination under an operator's pricing model.
 * Used to display the fee in the storefront checkout + operator booking builder
 * before the booking is created (createBooking re-resolves it authoritatively).
 * Returns only pricing info (delivery pricing is public), no auth required.
 */
export async function previewDeliveryFeeAction(input: {
  operatorId: string;
  zip?: string | null;
  address?: string | null;
}): Promise<DeliveryFeePreview> {
  const { data: op } = await createAdminClient()
    .from("operators")
    .select("delivery_fee_cents, delivery_mode, delivery_config, latitude, longitude")
    .eq("id", input.operatorId)
    .maybeSingle();
  if (!op) return { feeCents: null, outOfArea: false, needsLocation: true };

  const quote = await resolveOperatorDeliveryFee(
    {
      mode: (op.delivery_mode as DeliveryMode) ?? "flat",
      flatCents: op.delivery_fee_cents ?? 0,
      config: op.delivery_config,
      lat: op.latitude ?? null,
      lon: op.longitude ?? null,
    },
    { zip: input.zip, address: input.address },
  );
  return {
    feeCents: quote.feeCents,
    outOfArea: quote.outOfArea,
    needsLocation: quote.needsLocation,
    label: quote.label,
  };
}
