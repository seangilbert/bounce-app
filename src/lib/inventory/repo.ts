import { createAdminClient } from "@/utils/supabase/admin";
import type { Item, NewItem, Operator, PriceUnit } from "./types";

const OPERATORS = "operators";
const ITEMS = "items";

interface OperatorRow {
  id: string;
  name: string;
  owner_name: string | null;
  location: string | null;
  plan: string | null;
  latitude: number | null;
  longitude: number | null;
  contact_email: string | null;
  brand_color: string | null;
  logo_url: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  subscription_status: string | null;
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
    ownerName: r.owner_name,
    location: r.location,
    plan: r.plan ?? "solo",
    latitude: r.latitude,
    longitude: r.longitude,
    contactEmail: r.contact_email,
    brandColor: r.brand_color,
    logoUrl: r.logo_url,
    stripeCustomerId: r.stripe_customer_id,
    stripeSubscriptionId: r.stripe_subscription_id,
    subscriptionStatus: r.subscription_status,
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

export interface ItemPatch {
  name?: string;
  description?: string | null;
  category?: string | null;
  quantity?: number;
  basePrice?: number;
  priceUnit?: PriceUnit;
  powerRequired?: boolean;
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
