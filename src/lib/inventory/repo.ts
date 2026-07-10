import { createAdminClient } from "@/utils/supabase/admin";
import type { Item, NewItem, Operator, PriceUnit } from "./types";

const OPERATORS = "operators";
const ITEMS = "items";

interface OperatorRow {
  id: string;
  name: string;
  slug: string | null;
  owner_name: string | null;
  location: string | null;
  plan: string | null;
  latitude: number | null;
  longitude: number | null;
  contact_email: string | null;
  timezone: string | null;
  brand_color: string | null;
  logo_url: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  subscription_status: string | null;
  stripe_connect_id: string | null;
  connect_charges_enabled: boolean | null;
  phone: string | null;
  deposit_percent: number | null;
  auto_quote_cap_cents: number | null;
  min_lead_hours: number | null;
  tax_percent: number | string | null;
  delivery_fee_cents: number | null;
  delivery_taxable: boolean | null;
}

interface ItemRow {
  id: string;
  created_at: string;
  updated_at: string;
  operator_id: string;
  name: string;
  description: string | null;
  category: string | null;
  quantity: number;
  base_price: number;
  price_unit: Item["priceUnit"];
  footprint_w: number | null;
  footprint_l: number | null;
  footprint_h: number | null;
  power_required: boolean;
  images: string[];
  active: boolean;
}

function rowToOperator(r: OperatorRow): Operator {
  return {
    id: r.id,
    name: r.name,
    slug: r.slug,
    ownerName: r.owner_name,
    location: r.location,
    plan: r.plan ?? "solo",
    latitude: r.latitude,
    longitude: r.longitude,
    contactEmail: r.contact_email,
    timezone: r.timezone ?? "America/New_York",
    brandColor: r.brand_color,
    logoUrl: r.logo_url,
    stripeCustomerId: r.stripe_customer_id,
    stripeSubscriptionId: r.stripe_subscription_id,
    subscriptionStatus: r.subscription_status,
    stripeConnectId: r.stripe_connect_id,
    connectChargesEnabled: r.connect_charges_enabled ?? false,
    phone: r.phone,
    depositPercent: r.deposit_percent ?? 30,
    autoQuoteCapCents: r.auto_quote_cap_cents ?? 75_000,
    minLeadHours: r.min_lead_hours ?? 48,
    taxPercent: Number(r.tax_percent ?? 0),
    deliveryFeeCents: r.delivery_fee_cents ?? 0,
    deliveryTaxable: r.delivery_taxable ?? true,
  };
}

function rowToItem(r: ItemRow): Item {
  return {
    id: r.id,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    operatorId: r.operator_id,
    name: r.name,
    description: r.description,
    category: r.category,
    quantity: r.quantity,
    basePrice: r.base_price,
    priceUnit: r.price_unit,
    footprint: { w: r.footprint_w, l: r.footprint_l, h: r.footprint_h },
    powerRequired: r.power_required,
    images: r.images ?? [],
    active: r.active,
  };
}

/**
 * The active operator for this single-operator MVP: the earliest-created
 * operator row. Multi-tenant callers will pass an explicit operator id instead.
 */
export async function getDefaultOperator(): Promise<Operator | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from(OPERATORS)
    .select()
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`getDefaultOperator failed: ${error.message}`);
  return data ? rowToOperator(data as OperatorRow) : null;
}

/** Load a single operator by id (used to resolve the session's operator). */
export async function getOperatorById(id: string): Promise<Operator | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.from(OPERATORS).select().eq("id", id).maybeSingle();
  if (error) throw new Error(`getOperatorById failed: ${error.message}`);
  return data ? rowToOperator(data as OperatorRow) : null;
}

/**
 * The operator a user belongs to, in ONE query (join through membership) instead
 * of a membership lookup followed by an operator fetch — the session resolver
 * runs on every operator page navigation, so the round-trip saved matters.
 */
export async function getOperatorForUser(userId: string): Promise<Operator | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("operator_members")
    .select("operators(*)")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`getOperatorForUser failed: ${error.message}`);
  const op = (data as { operators: OperatorRow | null } | null)?.operators ?? null;
  return op ? rowToOperator(op) : null;
}

/** Load an operator by their public storefront slug. */
export async function getOperatorBySlug(slug: string): Promise<Operator | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.from(OPERATORS).select().eq("slug", slug).maybeSingle();
  if (error) throw new Error(`getOperatorBySlug failed: ${error.message}`);
  return data ? rowToOperator(data as OperatorRow) : null;
}

/** URL-safe handle from a business name. */
export function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "operator"
  );
}

/** A slug for this business name that isn't already taken (appends -2, -3, …). */
export async function generateUniqueSlug(name: string): Promise<string> {
  const supabase = createAdminClient();
  const base = slugify(name);
  const { data } = await supabase.from(OPERATORS).select("slug").ilike("slug", `${base}%`);
  const taken = new Set((data ?? []).map((r) => r.slug as string | null).filter(Boolean));
  if (!taken.has(base)) return base;
  for (let i = 2; i < 1000; i++) {
    const candidate = `${base}-${i}`;
    if (!taken.has(candidate)) return candidate;
  }
  return `${base}-${Math.floor(Math.random() * 1e6)}`;
}

export interface ItemPatch {
  name?: string;
  description?: string | null;
  category?: string | null;
  quantity?: number;
  basePrice?: number;
  priceUnit?: PriceUnit;
  powerRequired?: boolean;
  images?: string[];
  active?: boolean;
}

/** Update an item, scoped to its operator (an operator can't touch another's). */
export async function updateItem(operatorId: string, id: string, patch: ItemPatch): Promise<Item> {
  const supabase = createAdminClient();
  const row: Record<string, unknown> = {};
  if (patch.name !== undefined) row.name = patch.name;
  if (patch.description !== undefined) row.description = patch.description;
  if (patch.category !== undefined) row.category = patch.category;
  if (patch.quantity !== undefined) row.quantity = patch.quantity;
  if (patch.basePrice !== undefined) row.base_price = patch.basePrice;
  if (patch.priceUnit !== undefined) row.price_unit = patch.priceUnit;
  if (patch.powerRequired !== undefined) row.power_required = patch.powerRequired;
  if (patch.images !== undefined) row.images = patch.images;
  if (patch.active !== undefined) row.active = patch.active;

  const { data, error } = await supabase
    .from(ITEMS)
    .update(row)
    .eq("id", id)
    .eq("operator_id", operatorId)
    .select()
    .single();
  if (error) throw new Error(`updateItem failed: ${error.message}`);
  return rowToItem(data as ItemRow);
}

/** Delete an item. Fails gracefully if it's referenced by bookings. */
export async function deleteItem(
  operatorId: string,
  id: string,
): Promise<{ ok: boolean; reason?: string }> {
  const supabase = createAdminClient();
  const { error } = await supabase.from(ITEMS).delete().eq("id", id).eq("operator_id", operatorId);
  if (error) {
    if (/foreign key|violates|referenced|constraint/i.test(error.message)) {
      return { ok: false, reason: "This item has bookings — deactivate it instead of deleting." };
    }
    throw new Error(`deleteItem failed: ${error.message}`);
  }
  return { ok: true };
}

export async function listItems(
  operatorId: string,
  opts: { activeOnly?: boolean } = {},
): Promise<Item[]> {
  const supabase = createAdminClient();
  let query = supabase.from(ITEMS).select().eq("operator_id", operatorId);
  if (opts.activeOnly) query = query.eq("active", true);
  const { data, error } = await query.order("name", { ascending: true });
  if (error) throw new Error(`listItems failed: ${error.message}`);
  return (data as ItemRow[]).map(rowToItem);
}

/** How many catalog items the operator has (for plan-limit enforcement). */
export async function countItems(operatorId: string): Promise<number> {
  const supabase = createAdminClient();
  const { count, error } = await supabase
    .from(ITEMS)
    .select("id", { count: "exact", head: true })
    .eq("operator_id", operatorId);
  if (error) throw new Error(`countItems failed: ${error.message}`);
  return count ?? 0;
}

export async function getItem(id: string): Promise<Item | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.from(ITEMS).select().eq("id", id).maybeSingle();
  if (error) throw new Error(`getItem failed: ${error.message}`);
  return data ? rowToItem(data as ItemRow) : null;
}

export async function createItem(input: NewItem): Promise<Item> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from(ITEMS)
    .insert({
      operator_id: input.operatorId,
      name: input.name,
      description: input.description ?? null,
      category: input.category ?? null,
      quantity: input.quantity,
      base_price: input.basePrice,
      price_unit: input.priceUnit ?? "per_day",
      footprint_w: input.footprint?.w ?? null,
      footprint_l: input.footprint?.l ?? null,
      footprint_h: input.footprint?.h ?? null,
      power_required: input.powerRequired ?? true,
      images: input.images ?? [],
      active: input.active ?? true,
    })
    .select()
    .single();
  if (error) throw new Error(`createItem failed: ${error.message}`);
  return rowToItem(data as ItemRow);
}
