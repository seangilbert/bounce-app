"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/operator/session";
import { createItem, updateItem, deleteItem, countItems, getItem } from "@/lib/inventory/repo";
import { getItemImages, removeItemPhotos } from "@/lib/inventory/photos";
import { MAX_TOTAL_ITEMS } from "@/lib/inventory/live-cap";
import { planCapabilities, effectivePlanId } from "@/lib/plans";

const ItemInput = z.object({
  name: z.string().trim().min(1, "Name is required.").max(120),
  category: z.string().trim().max(40).nullable().optional(),
  description: z.string().trim().max(500).nullable().optional(),
  quantity: z.number().int().min(0).max(9999),
  unitsNeedsCleaning: z.number().int().min(0).max(9999).optional(),
  unitsDamaged: z.number().int().min(0).max(9999).optional(),
  unitsInRepair: z.number().int().min(0).max(9999).optional(),
  requiredEquipment: z
    .array(z.object({ label: z.string().trim().max(60), qty: z.number().int().min(1).max(999) }))
    .max(40)
    .optional(),
  basePrice: z.number().int().min(0), // minor units (cents)
  priceUnit: z.enum(["per_day", "per_hour", "flat"]),
  // Footprint in feet — fully optional; each dimension may be null (unset).
  footprint: z
    .object({
      w: z.number().min(0).max(999).nullable(),
      l: z.number().min(0).max(999).nullable(),
      h: z.number().min(0).max(999).nullable(),
    })
    .optional(),
  powerRequired: z.boolean().optional(),
  images: z.array(z.string().url()).max(12).optional(),
  active: z.boolean().optional(),
});

export type ActionResult = { ok: true } | { ok: false; error: string };

/** Plan caps apply to LIVE items only (hidden items are always safe to keep),
 *  so the message points at the two ways out: hide something, or upgrade. */
function liveCapError(op: { plan: string | null; subscriptionStatus: string | null; billingExempt?: boolean | null }, cap: number): string {
  return effectivePlanId(op) === "free"
    ? `The Free plan is limited to ${cap} live items. Hide another item first, or upgrade — hidden items stay saved.`
    : `Your plan is limited to ${cap} live items. Hide another item first.`;
}

export async function createItemAction(input: unknown): Promise<ActionResult> {
  const g = await requireAdmin();
  if (!g.ok) return { ok: false, error: g.error };
  const op = g.membership.operator;
  const p = ItemInput.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "Invalid item." };
  // Plan limits cap *live* items, not owned ones — creating hidden items is
  // always allowed (bulk import relies on this), bounded only by the abuse
  // ceiling on total catalog size.
  const willBeLive = p.data.active ?? true;
  const cap = planCapabilities(op).maxItems;
  const [total, live] = await Promise.all([
    countItems(op.id),
    willBeLive && Number.isFinite(cap) ? countItems(op.id, { activeOnly: true }) : 0,
  ]);
  if (total >= MAX_TOTAL_ITEMS) {
    return { ok: false, error: `Catalogs are limited to ${MAX_TOTAL_ITEMS} items.` };
  }
  if (willBeLive && Number.isFinite(cap) && live >= cap) {
    return { ok: false, error: liveCapError(op, cap) };
  }
  try {
    await createItem({
      operatorId: op.id,
      ...p.data,
      category: p.data.category ?? null,
      description: p.data.description ?? null,
    });
    revalidatePath("/inventory");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not add item." };
  }
}

export async function updateItemAction(id: string, input: unknown): Promise<ActionResult> {
  const g = await requireAdmin();
  if (!g.ok) return { ok: false, error: g.error };
  const op = g.membership.operator;
  const p = ItemInput.partial().safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "Invalid item." };
  // Activating a hidden item is where the live-item cap bites (creates and
  // edits of already-live items are covered elsewhere; deactivation is free).
  if (p.data.active === true) {
    const cap = planCapabilities(op).maxItems;
    if (Number.isFinite(cap)) {
      const current = await getItem(id);
      if (
        current &&
        current.operatorId === op.id &&
        !current.active &&
        (await countItems(op.id, { activeOnly: true })) >= cap
      ) {
        return { ok: false, error: liveCapError(op, cap) };
      }
    }
  }
  try {
    // Delete photos that were removed in this edit (best-effort, before the write).
    let removed: string[] = [];
    if (p.data.images !== undefined) {
      const before = await getItemImages(op.id, id);
      removed = before.filter((u) => !p.data.images!.includes(u));
    }
    await updateItem(op.id, id, p.data);
    if (removed.length) await removeItemPhotos(op.id, removed);
    revalidatePath("/inventory");
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Could not update item.";
    if (/items_out_of_service_within_owned/.test(msg)) {
      return { ok: false, error: "Units out of service can't exceed the total owned." };
    }
    return { ok: false, error: msg };
  }
}

export async function deleteItemAction(id: string): Promise<ActionResult> {
  const g = await requireAdmin();
  if (!g.ok) return { ok: false, error: g.error };
  const op = g.membership.operator;
  const images = await getItemImages(op.id, id); // capture before delete for cleanup
  const res = await deleteItem(op.id, id);
  if (!res.ok) return { ok: false, error: res.reason ?? "Could not delete item." };
  if (images.length) await removeItemPhotos(op.id, images);
  revalidatePath("/inventory");
  return { ok: true };
}
