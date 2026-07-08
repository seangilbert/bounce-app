"use server";

import { revalidatePath } from "next/cache";
import { getSessionOperator } from "@/lib/operator/session";
import { updateCustomerNotes } from "@/lib/customers/repo";

export type ActionResult = { ok: true } | { ok: false; error: string };

export async function updateCustomerNotesAction(id: string, notes: string): Promise<ActionResult> {
  const op = await getSessionOperator();
  if (!op) return { ok: false, error: "Not signed in." };
  try {
    const ok = await updateCustomerNotes(op.id, id, notes);
    if (!ok) return { ok: false, error: "Customer not found." };
    revalidatePath(`/customers/${id}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not save notes." };
  }
}
