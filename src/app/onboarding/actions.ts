"use server";

import { revalidatePath } from "next/cache";
import { getSessionOperator, requireAdmin } from "@/lib/operator/session";
import { geocodeLocation } from "@/lib/operator/geocode";
import { createClient } from "@/utils/supabase/server";

export type LocationResult = { ok: true; location: string } | { ok: false; error: string };
export type SetupResult = { ok: true } | { ok: false; error: string };

/** Geocode + save the operator's service area (sets lat/lon for weather). */
export async function saveLocationAction(query: string): Promise<LocationResult> {
  const op = await getSessionOperator();
  if (!op) return { ok: false, error: "Not signed in." };
  const q = (query ?? "").trim();
  if (!q) return { ok: false, error: "Enter your city." };

  const geo = await geocodeLocation(q);
  if (!geo) return { ok: false, error: "Couldn't find that place — try “City, State”." };

  const { error } = await createClient()
    .from("operators")
    .update({ location: geo.label, latitude: geo.latitude, longitude: geo.longitude })
    .eq("id", op.id);
  if (error) return { ok: false, error: "Could not save your location." };

  revalidatePath("/onboarding");
  revalidatePath("/dashboard");
  return { ok: true, location: geo.label };
}

/** Hide (or bring back) the dashboard "Get set up" card. The guide itself stays
 *  at /onboarding either way — dismissing is about the dashboard, not the work. */
export async function setSetupDismissedAction(dismissed: boolean): Promise<SetupResult> {
  const g = await requireAdmin();
  if (!g.ok) return { ok: false, error: g.error };

  const { error } = await createClient()
    .from("operators")
    .update({ setup_dismissed_at: dismissed ? new Date().toISOString() : null })
    .eq("id", g.membership.operator.id);
  if (error) return { ok: false, error: "Could not update your setup guide." };

  revalidatePath("/dashboard");
  revalidatePath("/onboarding");
  revalidatePath("/settings");
  return { ok: true };
}
