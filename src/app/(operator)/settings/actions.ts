"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/operator/session";
import { POLICY_MAX_CHARS } from "@/lib/operator/policies";
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
  const g = await requireAdmin();
  if (!g.ok) return { ok: false, error: g.error };
  const op = g.membership.operator;
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
  const g = await requireAdmin();
  if (!g.ok) return { ok: false, error: g.error };
  const op = g.membership.operator;
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

const CustomerPoliciesInput = z.object({
  cancellationPolicy: z.string().trim().max(POLICY_MAX_CHARS).optional().nullable(),
  damagePolicy: z.string().trim().max(POLICY_MAX_CHARS).optional().nullable(),
});

export async function updateCustomerPoliciesAction(input: unknown): Promise<ActionResult> {
  const g = await requireAdmin();
  if (!g.ok) return { ok: false, error: g.error };
  const op = g.membership.operator;
  const p = CustomerPoliciesInput.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "Invalid." };
  const { error } = await createAdminClient()
    .from("operators")
    .update({
      cancellation_policy: p.data.cancellationPolicy?.trim() || null,
      damage_policy: p.data.damagePolicy?.trim() || null,
    })
    .eq("id", op.id);
  if (error) return { ok: false, error: "Could not save your policies." };
  revalidatePath("/settings");
  return { ok: true };
}

const ContractIdentityInput = z.object({
  businessAddress: z.string().trim().max(300).optional().nullable(),
  esignSignerName: z.string().trim().max(120).optional().nullable(),
  esignSignerEmail: z
    .string()
    .trim()
    .max(200)
    .optional()
    .nullable()
    .refine((v) => !v || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v), "Enter a valid signer email."),
  signwellTemplateId: z.string().trim().max(120).optional().nullable(),
});

export async function updateContractIdentityAction(input: unknown): Promise<ActionResult> {
  const g = await requireAdmin();
  if (!g.ok) return { ok: false, error: g.error };
  const op = g.membership.operator;
  const p = ContractIdentityInput.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "Invalid." };
  const { error } = await createAdminClient()
    .from("operators")
    .update({
      business_address: p.data.businessAddress?.trim() || null,
      esign_signer_name: p.data.esignSignerName?.trim() || null,
      esign_signer_email: p.data.esignSignerEmail?.trim() || null,
      signwell_template_id: p.data.signwellTemplateId?.trim() || null,
    })
    .eq("id", op.id);
  if (error) return { ok: false, error: "Could not save contract details." };
  revalidatePath("/settings");
  return { ok: true };
}

const NotificationPrefsInput = z.object({
  notifyNewInquiry: z.boolean(),
  notifyNewBooking: z.boolean(),
  notifyBalancePaid: z.boolean(),
  notifyContractSigned: z.boolean(),
});

export async function updateNotificationPrefsAction(input: unknown): Promise<ActionResult> {
  const g = await requireAdmin();
  if (!g.ok) return { ok: false, error: g.error };
  const op = g.membership.operator;
  const p = NotificationPrefsInput.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "Invalid." };
  const { error } = await createAdminClient()
    .from("operators")
    .update({
      notify_new_inquiry: p.data.notifyNewInquiry,
      notify_new_booking: p.data.notifyNewBooking,
      notify_balance_paid: p.data.notifyBalancePaid,
      notify_contract_signed: p.data.notifyContractSigned,
    })
    .eq("id", op.id);
  if (error) return { ok: false, error: "Could not save notification settings." };
  revalidatePath("/settings");
  return { ok: true };
}

const BrandingInput = z.object({
  brandColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "Pick a valid color.")
    .nullable(),
  tagline: z.string().trim().max(80).optional().nullable(),
  about: z.string().trim().max(400).optional().nullable(),
});

export async function updateBrandingAction(input: unknown): Promise<ActionResult> {
  const g = await requireAdmin();
  if (!g.ok) return { ok: false, error: g.error };
  const op = g.membership.operator;
  const p = BrandingInput.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "Invalid." };
  const { error } = await createAdminClient()
    .from("operators")
    .update({
      brand_color: p.data.brandColor,
      tagline: p.data.tagline?.trim() || null,
      about: p.data.about?.trim() || null,
    })
    .eq("id", op.id);
  if (error) return { ok: false, error: "Could not save branding." };
  revalidatePath("/settings");
  revalidatePath("/dashboard");
  return { ok: true };
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const AvailabilityInput = z.object({
  operatingDays: z.array(z.number().int().min(0).max(6)).min(1, "Pick at least one operating day."),
  deliveryWindows: z.array(z.string().trim().max(40)).max(12),
  blackouts: z
    .array(z.object({ start: z.string().regex(ISO_DATE), end: z.string().regex(ISO_DATE) }))
    .max(200),
});

export async function updateAvailabilityAction(input: unknown): Promise<ActionResult> {
  const g = await requireAdmin();
  if (!g.ok) return { ok: false, error: g.error };
  const op = g.membership.operator;
  const p = AvailabilityInput.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "Invalid availability." };
  const config = {
    operatingDays: [...new Set(p.data.operatingDays)].sort(),
    deliveryWindows: p.data.deliveryWindows.map((w) => w.trim()).filter(Boolean),
    blackouts: p.data.blackouts.map((b) => (b.end < b.start ? { start: b.end, end: b.start } : b)),
  };
  const { error } = await createAdminClient()
    .from("operators")
    .update({ availability_config: config })
    .eq("id", op.id);
  if (error) return { ok: false, error: "Could not save availability." };
  revalidatePath("/settings");
  revalidatePath("/dashboard");
  revalidatePath("/calendar");
  return { ok: true };
}

const PricingInput = z.object({
  taxPercent: z.number().min(0).max(100),
  deliveryTaxable: z.boolean(),
});

export async function updatePricingAction(input: unknown): Promise<ActionResult> {
  const g = await requireAdmin();
  if (!g.ok) return { ok: false, error: g.error };
  const op = g.membership.operator;
  const p = PricingInput.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "Invalid." };
  const { error } = await createAdminClient()
    .from("operators")
    .update({ tax_percent: p.data.taxPercent, delivery_taxable: p.data.deliveryTaxable })
    .eq("id", op.id);
  if (error) return { ok: false, error: "Could not save pricing." };
  revalidatePath("/settings");
  revalidatePath("/dashboard");
  return { ok: true };
}

const ZoneInput = z.object({
  id: z.string(),
  label: z.string().max(80),
  feeCents: z.number().int().min(0),
  zips: z.array(z.string().max(12)).max(200),
  towns: z.array(z.string().max(80)).max(200),
});
const DeliveryPricingInput = z.object({
  mode: z.enum(["flat", "zones", "distance"]),
  deliveryFeeCents: z.number().int().min(0),
  config: z.object({
    zones: z.array(ZoneInput).max(100),
    outOfAreaCents: z.number().int().min(0).nullable(),
    distance: z.object({
      freeMiles: z.number().min(0).max(10000),
      perMileCents: z.number().int().min(0),
      maxMiles: z.number().min(0).max(10000).nullable(),
    }),
  }),
});

export async function updateDeliveryPricingAction(input: unknown): Promise<ActionResult> {
  const g = await requireAdmin();
  if (!g.ok) return { ok: false, error: g.error };
  const op = g.membership.operator;
  const p = DeliveryPricingInput.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "Invalid delivery pricing." };
  const { error } = await createAdminClient()
    .from("operators")
    .update({
      delivery_mode: p.data.mode,
      delivery_fee_cents: p.data.deliveryFeeCents,
      delivery_config: p.data.config,
    })
    .eq("id", op.id);
  if (error) return { ok: false, error: "Could not save delivery pricing." };
  revalidatePath("/settings");
  revalidatePath("/dashboard");
  return { ok: true };
}
