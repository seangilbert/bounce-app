import { cache } from "react";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { getOperatorById } from "@/lib/inventory/repo";
import type { Operator } from "@/lib/inventory/types";

/**
 * The authenticated user for this request, or null.
 * `cache()` memoizes it per render, so the layout + page share ONE
 * `auth.getUser()` round-trip instead of each paying for it.
 */
export const getSessionUser = cache(async (): Promise<User | null> => {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});

/**
 * The operator the signed-in user belongs to — how the operator app resolves
 * "the current operator" now that we're multi-tenant. Returns null if there's
 * no session or the user isn't linked to an operator. Membership lookup uses the
 * service-role client (RLS-independent); the caller must already be gated by
 * auth middleware. `cache()`d so the layout + page don't re-resolve it.
 */
export const getSessionOperator = cache(async (): Promise<Operator | null> => {
  const user = await getSessionUser();
  if (!user) return null;

  const admin = createAdminClient();
  const { data: member, error } = await admin
    .from("operator_members")
    .select("operator_id")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`getSessionOperator failed: ${error.message}`);
  if (!member) return null;

  return getOperatorById(member.operator_id as string);
});
