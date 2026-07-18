import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";

export type PromoKind = "percent" | "fixed";
export type PromoTrigger = "code" | "weekday" | "repeat";

export interface Promo {
  id: string;
  operatorId: string;
  code: string;
  kind: PromoKind;
  /** percent (0–100) or fixed amount in cents. */
  value: number;
  trigger: PromoTrigger;
  /** For `weekday`: days it applies (0=Sun … 6=Sat). */
  weekdays: number[];
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
  trigger: PromoTrigger | null;
  weekdays: number[] | null;
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
  trigger: r.trigger ?? "code",
  weekdays: r.weekdays ?? [],
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
  const supabase = createClient();
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
  trigger: PromoTrigger;
  weekdays: number[];
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
    trigger: input.trigger,
    weekdays: input.trigger === "weekday" ? [...new Set(input.weekdays)].sort() : [],
    active: input.active,
    starts_on: input.startsOn,
    ends_on: input.endsOn,
    min_subtotal_cents: input.minSubtotalCents,
    usage_limit: input.usageLimit,
  };
}

export async function createPromo(operatorId: string, input: PromoInput): Promise<Promo> {
  const supabase = createClient();
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
  const supabase = createClient();
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
  const supabase = createClient();
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
    .eq("trigger", "code") // auto-promos aren't redeemable by typing their name
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

/** Customer-facing label for an applied promo. */
export function promoLabel(promo: Pick<Promo, "trigger" | "code">): string {
  if (promo.trigger === "weekday") return "Weekday discount";
  if (promo.trigger === "repeat") return "Returning customer";
  return promo.code;
}

function weekdayOf(iso: string): number {
  return new Date(`${iso}T00:00:00Z`).getUTCDay();
}

export type AppliedKind = "code" | "weekday" | "repeat" | null;

export interface DiscountResolution {
  discountCents: number;
  promoId: string | null;
  /** Snapshot value stored on the booking (the code / promo name). */
  code: string | null;
  /** Display label. */
  label: string;
  appliedKind: AppliedKind;
  /** Why a typed code didn't apply (when it lost or was invalid). */
  codeReason?: string;
}

/**
 * The single best discount for a booking: the typed code (if any) plus every
 * applicable automatic promo, taking whichever gives the largest discount. No
 * stacking. Shared by createBooking (authoritative) and the checkout preview.
 */
export async function resolveBookingDiscount(
  operatorId: string,
  input: { code?: string | null; subtotalCents: number; startDate: string; customerHasPrior: boolean; today: string },
): Promise<DiscountResolution> {
  const candidates: { discountCents: number; promoId: string; code: string; label: string; kind: AppliedKind }[] = [];
  let codeReason: string | undefined;

  if (input.code?.trim()) {
    const r = await applyPromo(operatorId, input.code, input.subtotalCents, input.today);
    if (r.ok && r.promoId && r.code) {
      candidates.push({ discountCents: r.discountCents, promoId: r.promoId, code: r.code, label: r.code, kind: "code" });
    } else {
      codeReason = r.reason;
    }
  }

  const supabase = createAdminClient();
  const { data } = await supabase
    .from(PROMOS)
    .select("*")
    .eq("operator_id", operatorId)
    .eq("active", true)
    .in("trigger", ["weekday", "repeat"]);
  for (const row of (data ?? []) as PromoRow[]) {
    const p = rowToPromo(row);
    if (p.startsOn && input.today < p.startsOn) continue;
    if (p.endsOn && input.today > p.endsOn) continue;
    if (p.usageLimit != null && p.usedCount >= p.usageLimit) continue;
    if (input.subtotalCents < p.minSubtotalCents) continue;
    const applies =
      p.trigger === "weekday" ? p.weekdays.includes(weekdayOf(input.startDate)) : input.customerHasPrior;
    if (!applies) continue;
    const d = computeDiscount(p, input.subtotalCents);
    if (d > 0) candidates.push({ discountCents: d, promoId: p.id, code: p.code, label: promoLabel(p), kind: p.trigger });
  }

  const best = candidates.sort((a, b) => b.discountCents - a.discountCents)[0];
  if (!best) return { discountCents: 0, promoId: null, code: null, label: "", appliedKind: null, codeReason };
  // Only surface a code error when the code itself was what failed (not when an
  // auto-promo simply beat a valid code).
  return {
    discountCents: best.discountCents,
    promoId: best.promoId,
    code: best.code,
    label: best.label,
    appliedKind: best.kind,
    codeReason: best.kind === "code" ? undefined : codeReason,
  };
}
