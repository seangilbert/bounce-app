"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getSessionOperator } from "@/lib/operator/session";
import { createItem, updateItem, deleteItem, countItems } from "@/lib/inventory/repo";
import { getItemImages, removeItemPhotos } from "@/lib/inventory/photos";
import { planCapabilities, effectivePlanId } from "@/lib/plans";

const ItemInput = z.object({
  name: z.string().trim().min(1, "Name is required.").max(120),
  category: z.string().trim().max(40).nullable().optional(),
  description: z.string().trim().max(500).nullable().optional(),
  quantity: z.number().int().min(0).max(9999),
  unitsNeedsCleaning: z.number().int().min(0).max(9999).optional(),
  unitsDamaged: z.number().int().min(0).max(9999).optional(),
  unitsInRepair: z.number().int().min(0).max(9999).optional(),
  basePrice: z.number().int().min(0), // minor units (cents)
  priceUnit: z.enum(["per_day", "per_hour", "flat"]),
  powerRequired: z.boolean().optional(),
  images: z.array(z.string().url()).max(12).optional(),
  active: z.boolean().optional(),
});

export type ActionResult = { ok: true } | { ok: false; error: string };

export async function createItemAction(input: unknown): Promise<ActionResult> {
  const op = await getSessionOperator();
  if (!op) return { ok: false, error: "Not signed in." };
  const p = ItemInput.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "Invalid item." };
  // Plan limit: cap on *create* (existing items are grandfathered on downgrade).
  const cap = planCapabilities(op).maxItems;
  if (Number.isFinite(cap) && (await countItems(op.id)) >= cap) {
    const plan = effectivePlanId(op);
    return {
      ok: false,
      error:
        plan === "free"
          ? `The Free plan is limited to ${cap} catalog items. Upgrade to add more.`
          : `Your plan is limited to ${cap} catalog items.`,
    };
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
  const op = await getSessionOperator();
  if (!op) return { ok: false, error: "Not signed in." };
  const p = ItemInput.partial().safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "Invalid item." };
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
  const op = await getSessionOperator();
  if (!op) return { ok: false, error: "Not signed in." };
  const images = await getItemImages(op.id, id); // capture before delete for cleanup
  const res = await deleteItem(op.id, id);
  if (!res.ok) return { ok: false, error: res.reason ?? "Could not delete item." };
  if (images.length) await removeItemPhotos(op.id, images);
  revalidatePath("/inventory");
  return { ok: true };
}
