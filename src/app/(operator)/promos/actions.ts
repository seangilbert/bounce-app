"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/operator/session";
import { createPromo, updatePromo, deletePromo, type PromoInput } from "@/lib/promos/repo";

export type ActionResult = { ok: true } | { ok: false; error: string };

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const PromoSchema = z
  .object({
    code: z.string().trim().min(2, "Name must be at least 2 characters.").max(30).regex(/^[A-Za-z0-9_-]+$/, "Letters, numbers, - and _ only."),
    kind: z.enum(["percent", "fixed"]),
    value: z.number().int().min(0),
    trigger: z.enum(["code", "weekday", "repeat"]),
    weekdays: z.array(z.number().int().min(0).max(6)).max(7),
    active: z.boolean(),
    startsOn: z.string().regex(ISO_DATE).nullable(),
    endsOn: z.string().regex(ISO_DATE).nullable(),
    minSubtotalCents: z.number().int().min(0),
    usageLimit: z.number().int().min(1).nullable(),
  })
  .refine((d) => (d.kind === "percent" ? d.value <= 100 : true), { message: "Percent off can't exceed 100.", path: ["value"] })
  .refine((d) => !d.startsOn || !d.endsOn || d.endsOn >= d.startsOn, { message: "End date must be on or after the start.", path: ["endsOn"] })
  .refine((d) => d.trigger !== "weekday" || d.weekdays.length > 0, { message: "Pick at least one weekday.", path: ["weekdays"] });

export async function createPromoAction(input: unknown): Promise<ActionResult> {
  const g = await requireAdmin();
  if (!g.ok) return { ok: false, error: g.error };
  const op = g.membership.operator;
  const p = PromoSchema.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "Invalid code." };
  try {
    await createPromo(op.id, p.data as PromoInput);
    revalidatePath("/promos");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not create the code." };
  }
}

export async function updatePromoAction(id: string, input: unknown): Promise<ActionResult> {
  const g = await requireAdmin();
  if (!g.ok) return { ok: false, error: g.error };
  const op = g.membership.operator;
  const p = PromoSchema.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "Invalid code." };
  try {
    await updatePromo(op.id, id, p.data as PromoInput);
    revalidatePath("/promos");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not update the code." };
  }
}

export async function deletePromoAction(id: string): Promise<ActionResult> {
  const g = await requireAdmin();
  if (!g.ok) return { ok: false, error: g.error };
  const op = g.membership.operator;
  try {
    await deletePromo(op.id, id);
    revalidatePath("/promos");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not delete the code." };
  }
}
