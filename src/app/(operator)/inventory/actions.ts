"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/operator/session";
import { createItem, updateItem, deleteItem, countItems, getItem, listItems } from "@/lib/inventory/repo";
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

export type ActionResult =
  | { ok: true }
  | { ok: false; error: string; /** set when the live-item cap blocked the write, so the UI can offer a swap */ code?: "live_cap" };

/** Plan caps apply to LIVE items only (hidden items are always safe to keep),
 *  so the message points at the two ways out: hide something, or upgrade. */
function liveCapError(
  op: { plan: string | null; subscriptionStatus: string | null; billingExempt?: boolean | null },
  cap: number,
): { ok: false; error: string; code: "live_cap" } {
  return {
    ok: false,
    code: "live_cap",
    error:
      effectivePlanId(op) === "free"
        ? `The Free plan is limited to ${cap} live items. Hide another item first, or upgrade — hidden items stay saved.`
        : `Your plan is limited to ${cap} live items. Hide another item first.`,
  };
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
    return liveCapError(op, cap);
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
        return liveCapError(op, cap);
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

/** The operator's live items, trimmed for the swap picker. */
export async function listSwapCandidatesAction(): Promise<
  { ok: true; items: { id: string; name: string; basePrice: number }[] } | { ok: false; error: string }
> {
  const g = await requireAdmin();
  if (!g.ok) return { ok: false, error: g.error };
  const items = await listItems(g.membership.operator.id, { activeOnly: true });
  return {
    ok: true,
    items: items.map((i) => ({ id: i.id, name: i.name, basePrice: i.basePrice })),
  };
}

/** Trade a live slot: hide one live item, make a hidden one live. Deactivates
 *  first so the pair never exceeds the cap; the activate is re-checked against
 *  the cap in case something changed underneath. */
export async function swapLiveAction(activateId: string, deactivateId: string): Promise<ActionResult> {
  const g = await requireAdmin();
  if (!g.ok) return { ok: false, error: g.error };
  const op = g.membership.operator;
  if (activateId === deactivateId) return { ok: false, error: "Pick two different items." };

  const [toActivate, toDeactivate] = await Promise.all([getItem(activateId), getItem(deactivateId)]);
  if (!toActivate || toActivate.operatorId !== op.id || toActivate.active) {
    return { ok: false, error: "That item can't be made live." };
  }
  if (!toDeactivate || toDeactivate.operatorId !== op.id || !toDeactivate.active) {
    return { ok: false, error: "That item isn't live anymore — refresh and try again." };
  }

  await updateItem(op.id, deactivateId, { active: false });
  const cap = planCapabilities(op).maxItems;
  if (Number.isFinite(cap) && (await countItems(op.id, { activeOnly: true })) >= cap) {
    return liveCapError(op, cap); // freed slot was taken concurrently; first item stays hidden
  }
  await updateItem(op.id, activateId, { active: true });
  revalidatePath("/inventory");
  return { ok: true };
}

/** Set exactly which items are live — the "pick your live items" moment after
 *  a downgrade leaves more items live than the plan allows. */
export async function chooseLiveItemsAction(ids: unknown): Promise<ActionResult> {
  const g = await requireAdmin();
  if (!g.ok) return { ok: false, error: g.error };
  const op = g.membership.operator;
  const p = z.array(z.string().uuid()).max(9999).safeParse(ids);
  if (!p.success) return { ok: false, error: "Invalid selection." };
  const chosen = new Set(p.data);
  const cap = planCapabilities(op).maxItems;
  if (Number.isFinite(cap) && chosen.size > cap) {
    return { ok: false, error: `Your plan allows ${cap} live items — you picked ${chosen.size}.` };
  }
  const items = await listItems(op.id);
  // Deactivate first so activations always have room.
  for (const i of items) {
    if (i.active && !chosen.has(i.id)) await updateItem(op.id, i.id, { active: false });
  }
  for (const i of items) {
    if (!i.active && chosen.has(i.id)) await updateItem(op.id, i.id, { active: true });
  }
  revalidatePath("/inventory");
  return { ok: true };
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
