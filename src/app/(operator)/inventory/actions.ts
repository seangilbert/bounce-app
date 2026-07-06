"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getSessionOperator } from "@/lib/operator/session";
import { createItem, updateItem, deleteItem } from "@/lib/inventory/repo";

const ItemInput = z.object({
  name: z.string().trim().min(1, "Name is required.").max(120),
  category: z.string().trim().max(40).nullable().optional(),
  description: z.string().trim().max(500).nullable().optional(),
  quantity: z.number().int().min(0).max(9999),
  basePrice: z.number().int().min(0), // minor units (cents)
  priceUnit: z.enum(["per_day", "per_hour", "flat"]),
  powerRequired: z.boolean().optional(),
  active: z.boolean().optional(),
});

export type ActionResult = { ok: true } | { ok: false; error: string };

export async function createItemAction(input: unknown): Promise<ActionResult> {
  const op = await getSessionOperator();
  if (!op) return { ok: false, error: "Not signed in." };
  const p = ItemInput.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "Invalid item." };
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
    await updateItem(op.id, id, p.data);
    revalidatePath("/inventory");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not update item." };
  }
}

export async function deleteItemAction(id: string): Promise<ActionResult> {
  const op = await getSessionOperator();
  if (!op) return { ok: false, error: "Not signed in." };
  const res = await deleteItem(op.id, id);
  if (!res.ok) return { ok: false, error: res.reason ?? "Could not delete item." };
  revalidatePath("/inventory");
  return { ok: true };
}
