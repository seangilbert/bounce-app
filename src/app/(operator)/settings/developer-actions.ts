"use server";

import { revalidatePath } from "next/cache";
import { getSessionOperator } from "@/lib/operator/session";
import { planCapabilities } from "@/lib/plans";
import {
  createApiKey,
  revokeApiKey,
  updateApiKeyOrigins,
  type ApiKeyType,
} from "@/lib/api-keys/repo";
import type { Operator } from "@/lib/inventory/types";

export type ActionResult = { ok: true } | { ok: false; error: string };

/** Resolve the signed-in operator and gate on the Growing (apiAccess) plan. */
async function gate(): Promise<{ ok: true; op: Operator } | { ok: false; error: string }> {
  const op = await getSessionOperator();
  if (!op) return { ok: false, error: "Not signed in." };
  if (!planCapabilities(op).apiAccess) return { ok: false, error: "API access requires the Growing plan." };
  return { ok: true, op };
}

export async function createApiKeyAction(input: {
  type: ApiKeyType;
  name?: string;
  allowedOrigins?: string[];
}): Promise<{ ok: true; fullKey: string } | { ok: false; error: string }> {
  const g = await gate();
  if (!g.ok) return { ok: false, error: g.error };
  if (input.type !== "publishable" && input.type !== "secret")
    return { ok: false, error: "Invalid key type." };
  try {
    const { fullKey } = await createApiKey(g.op.id, {
      type: input.type,
      name: input.name,
      allowedOrigins: input.allowedOrigins,
    });
    revalidatePath("/settings");
    return { ok: true, fullKey };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not create key." };
  }
}

export async function revokeApiKeyAction(id: string): Promise<ActionResult> {
  const g = await gate();
  if (!g.ok) return { ok: false, error: g.error };
  try {
    await revokeApiKey(g.op.id, id);
    revalidatePath("/settings");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not revoke key." };
  }
}

export async function updateApiKeyOriginsAction(id: string, origins: string[]): Promise<ActionResult> {
  const g = await gate();
  if (!g.ok) return { ok: false, error: g.error };
  try {
    await updateApiKeyOrigins(g.op.id, id, origins);
    revalidatePath("/settings");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not update origins." };
  }
}
