"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getSessionOperator } from "@/lib/operator/session";
import { geocodeLocation } from "@/lib/operator/geocode";
import { isValidTimeZone } from "@/lib/operator/time";
import { createAdminClient } from "@/utils/supabase/admin";

export type ActionResult = { ok: true } | { ok: false; error: string };

const ProfileInput = z.object({
  name: z.string().trim().min(1, "Business name is required.").max(120),
  ownerName: z.string().trim().max(120).optional().nullable(),
  phone: z.string().trim().max(40).optional().nullable(),
  location: z.string().trim().max(120).optional().nullable(),
  timezone: z.string().trim().refine(isValidTimeZone, "Invalid timezone.").optional(),
});

export async function updateProfileAction(input: unknown): Promise<ActionResult> {
  const op = await getSessionOperator();
  if (!op) return { ok: false, error: "Not signed in." };
  const p = ProfileInput.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "Invalid." };

  const patch: Record<string, unknown> = {
    name: p.data.name,
    owner_name: p.data.ownerName?.trim() || null,
    phone: p.data.phone?.trim() || null,
  };
  if (p.data.timezone) patch.timezone = p.data.timezone;

  const newLoc = p.data.location?.trim() || null;
  if (newLoc && newLoc !== op.location) {
    const geo = await geocodeLocation(newLoc);
    if (!geo) return { ok: false, error: "Couldn't find that location — try “City, State”." };
    patch.location = geo.label;
    patch.latitude = geo.latitude;
    patch.longitude = geo.longitude;
  } else if (!newLoc) {
    patch.location = null;
  }

  const { error } = await createAdminClient().from("operators").update(patch).eq("id", op.id);
  if (error) return { ok: false, error: "Could not save your profile." };
  revalidatePath("/settings");
  revalidatePath("/dashboard");
  revalidatePath("/calendar");
  revalidatePath("/deliveries");
  return { ok: true };
}

const PolicyInput = z.object({
  depositPercent: z.number().int().min(0).max(100),
  autoQuoteCapCents: z.number().int().min(0),
  minLeadHours: z.number().int().min(0).max(720),
});

export async function updatePolicyAction(input: unknown): Promise<ActionResult> {
  const op = await getSessionOperator();
  if (!op) return { ok: false, error: "Not signed in." };
  const p = PolicyInput.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "Invalid." };

  const { error } = await createAdminClient()
    .from("operators")
    .update({
      deposit_percent: p.data.depositPercent,
      auto_quote_cap_cents: p.data.autoQuoteCapCents,
      min_lead_hours: p.data.minLeadHours,
    })
    .eq("id", op.id);
  if (error) return { ok: false, error: "Could not save your policies." };
  revalidatePath("/settings");
  revalidatePath("/dashboard");
  return { ok: true };
}

const PricingInput = z.object({
  taxPercent: z.number().min(0).max(100),
  deliveryFeeCents: z.number().int().min(0),
  deliveryTaxable: z.boolean(),
});

export async function updatePricingAction(input: unknown): Promise<ActionResult> {
  const op = await getSessionOperator();
  if (!op) return { ok: false, error: "Not signed in." };
  const p = PricingInput.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "Invalid." };
  const { error } = await createAdminClient()
    .from("operators")
    .update({
      tax_percent: p.data.taxPercent,
      delivery_fee_cents: p.data.deliveryFeeCents,
      delivery_taxable: p.data.deliveryTaxable,
    })
    .eq("id", op.id);
  if (error) return { ok: false, error: "Could not save pricing." };
  revalidatePath("/settings");
  revalidatePath("/dashboard");
  return { ok: true };
}
