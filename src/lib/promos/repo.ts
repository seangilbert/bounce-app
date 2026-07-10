import { createAdminClient } from "@/utils/supabase/admin";

export type PromoKind = "percent" | "fixed";

export interface Promo {
  id: string;
  operatorId: string;
  code: string;
  kind: PromoKind;
  /** percent (0–100) or fixed amount in cents. */
  value: number;
  active: boolean;
  startsOn: string | null;
  endsOn: string | null;
  minSubtotalCents: number;
  usageLimit: number | null;
  usedCount: number;
  createdAt: string;
}

interface PromoRow {
  id: string;
  operator_id: string;
  code: string;
  kind: PromoKind;
  value: number;
  active: boolean;
  starts_on: string | null;
  ends_on: string | null;
  min_subtotal_cents: number;
  usage_limit: number | null;
  used_count: number;
  created_at: string;
}

const rowToPromo = (r: PromoRow): Promo => ({
  id: r.id,
  operatorId: r.operator_id,
  code: r.code,
  kind: r.kind,
  value: r.value,
  active: r.active,
  startsOn: r.starts_on,
  endsOn: r.ends_on,
  minSubtotalCents: r.min_subtotal_cents,
  usageLimit: r.usage_limit,
  usedCount: r.used_count,
  createdAt: r.created_at,
});

const PROMOS = "promos";

export async function listPromos(operatorId: string): Promise<Promo[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from(PROMOS)
    .select("*")
    .eq("operator_id", operatorId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`listPromos failed: ${error.message}`);
  return (data as PromoRow[]).map(rowToPromo);
}

export interface PromoInput {
  code: string;
  kind: PromoKind;
  value: number;
  active: boolean;
  startsOn: string | null;
  endsOn: string | null;
  minSubtotalCents: number;
  usageLimit: number | null;
}

function toRow(input: PromoInput) {
  return {
    code: input.code.trim().toUpperCase(),
    kind: input.kind,
    value: input.value,
    active: input.active,
    starts_on: input.startsOn,
    ends_on: input.endsOn,
    min_subtotal_cents: input.minSubtotalCents,
    usage_limit: input.usageLimit,
  };
}

export async function createPromo(operatorId: string, input: PromoInput): Promise<Promo> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from(PROMOS)
    .insert({ operator_id: operatorId, ...toRow(input) })
    .select()
    .single();
  if (error) {
    if (/duplicate|unique/i.test(error.message)) throw new Error("A code with that name already exists.");
    throw new Error(`createPromo failed: ${error.message}`);
  }
  return rowToPromo(data as PromoRow);
}

export async function updatePromo(operatorId: string, id: string, input: PromoInput): Promise<Promo> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from(PROMOS)
    .update(toRow(input))
    .eq("id", id)
    .eq("operator_id", operatorId)
    .select()
    .single();
  if (error) {
    if (/duplicate|unique/i.test(error.message)) throw new Error("A code with that name already exists.");
    throw new Error(`updatePromo failed: ${error.message}`);
  }
  return rowToPromo(data as PromoRow);
}

export async function deletePromo(operatorId: string, id: string): Promise<void> {
  const supabase = createAdminClient();
  const { error } = await supabase.from(PROMOS).delete().eq("id", id).eq("operator_id", operatorId);
  if (error) throw new Error(`deletePromo failed: ${error.message}`);
}

/** Increment redemption count when a promo'd booking is actually paid/booked. */
export async function incrementPromoUsage(promoId: string): Promise<void> {
  const supabase = createAdminClient();
  // Best-effort atomic-ish bump via RPC-free read-modify is race-prone; use a
  // single SQL increment through PostgREST's `rpc`-less update on a fetched row.
  const { data } = await supabase.from(PROMOS).select("used_count").eq("id", promoId).maybeSingle();
  if (!data) return;
  await supabase.from(PROMOS).update({ used_count: (data.used_count as number) + 1 }).eq("id", promoId);
}

/** Count a redemption for the promo on a booking (best-effort; safe if none). */
export async function redeemPromoForBooking(bookingId: string): Promise<void> {
  const supabase = createAdminClient();
  const { data } = await supabase.from("bookings").select("promo_id").eq("id", bookingId).maybeSingle();
  const promoId = data?.promo_id as string | null | undefined;
  if (promoId) await incrementPromoUsage(promoId);
}

export interface PromoResult {
  ok: boolean;
  reason?: string;
  discountCents: number;
  promoId?: string;
  code?: string;
}

const money = (c: number) => `$${(c / 100).toLocaleString("en-US")}`;

/** Discount (cents) a promo yields on a given items subtotal. */
export function computeDiscount(promo: Pick<Promo, "kind" | "value">, subtotalCents: number): number {
  const raw = promo.kind === "percent" ? Math.round((subtotalCents * promo.value) / 100) : promo.value;
  return Math.min(Math.max(0, raw), subtotalCents);
}

/**
 * Resolve + validate a code for this operator against a subtotal, returning the
 * discount or a friendly reason it can't apply. `today` is the operator-local
 * date (YYYY-MM-DD) for the active-window check.
 */
export async function applyPromo(
  operatorId: string,
  code: string,
  subtotalCents: number,
  today: string,
): Promise<PromoResult> {
  const trimmed = code.trim();
  if (!trimmed) return { ok: false, reason: "Enter a code.", discountCents: 0 };
  const supabase = createAdminClient();
  const { data } = await supabase
    .from(PROMOS)
    .select("*")
    .eq("operator_id", operatorId)
    .ilike("code", trimmed)
    .maybeSingle();
  const promo = data ? rowToPromo(data as PromoRow) : null;

  if (!promo || !promo.active) return { ok: false, reason: "That code isn't valid.", discountCents: 0 };
  if (promo.startsOn && today < promo.startsOn) return { ok: false, reason: "This code isn't active yet.", discountCents: 0 };
  if (promo.endsOn && today > promo.endsOn) return { ok: false, reason: "This code has expired.", discountCents: 0 };
  if (promo.usageLimit != null && promo.usedCount >= promo.usageLimit)
    return { ok: false, reason: "This code has been fully redeemed.", discountCents: 0 };
  if (subtotalCents < promo.minSubtotalCents)
    return { ok: false, reason: `Spend ${money(promo.minSubtotalCents)} to use this code.`, discountCents: 0 };

  const discountCents = computeDiscount(promo, subtotalCents);
  if (discountCents <= 0) return { ok: false, reason: "This code doesn't apply here.", discountCents: 0 };
  return { ok: true, discountCents, promoId: promo.id, code: promo.code };
}
