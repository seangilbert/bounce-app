"use server";

import { revalidatePath } from "next/cache";
import { getSessionOperator } from "@/lib/operator/session";
import { geocodeLocation } from "@/lib/operator/geocode";
import { createAdminClient } from "@/utils/supabase/admin";

export type LocationResult = { ok: true; location: string } | { ok: false; error: string };

/** Geocode + save the operator's service area (sets lat/lon for weather). */
export async function saveLocationAction(query: string): Promise<LocationResult> {
  const op = await getSessionOperator();
  if (!op) return { ok: false, error: "Not signed in." };
  const q = (query ?? "").trim();
  if (!q) return { ok: false, error: "Enter your city." };

  const geo = await geocodeLocation(q);
  if (!geo) return { ok: false, error: "Couldn't find that place — try “City, State”." };

  const { error } = await createAdminClient()
    .from("operators")
    .update({ location: geo.label, latitude: geo.latitude, longitude: geo.longitude })
    .eq("id", op.id);
  if (error) return { ok: false, error: "Could not save your location." };

  revalidatePath("/onboarding");
  revalidatePath("/dashboard");
  return { ok: true, location: geo.label };
}
