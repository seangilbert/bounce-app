import { cache } from "react";
import { headers } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { getOperatorForUser } from "@/lib/inventory/repo";
import { VERIFIED_USER_HEADER } from "@/utils/supabase/middleware";
import type { Operator } from "@/lib/inventory/types";

/**
 * The authenticated user id for this request, or null.
 *
 * Fast path: the middleware already verified the token with the auth server on
 * every operator request and forwarded the id via a trusted header — trust it,
 * so a page navigation doesn't pay a second `auth.getUser()` round-trip. If the
 * header is absent (e.g. an operator-scoped API route the middleware didn't
 * gate), verify for real. `cache()`d so the layout + page share one resolution.
 */
export const getSessionUser = cache(async (): Promise<{ id: string } | null> => {
  const verifiedId = headers().get(VERIFIED_USER_HEADER);
  if (verifiedId) return { id: verifiedId };

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user ? { id: user.id } : null;
});

/**
 * The operator the signed-in user belongs to — how the operator app resolves
 * "the current operator" now that we're multi-tenant. One join query (through
 * membership) rather than two round-trips. `cache()`d for the layout + page.
 */
export const getSessionOperator = cache(async (): Promise<Operator | null> => {
  const user = await getSessionUser();
  if (!user) return null;
  return getOperatorForUser(user.id);
});
