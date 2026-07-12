import { cache } from "react";
import { headers } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { getMembershipForUser } from "@/lib/inventory/repo";
import { VERIFIED_USER_HEADER } from "@/utils/supabase/middleware";
import type { Operator } from "@/lib/inventory/types";
import type { MemberRole } from "@/lib/operator/roles";

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
export interface SessionMembership {
  operator: Operator;
  role: MemberRole;
  userId: string;
  /** The signed-in USER's own email + display name — not the operator's owner. */
  userEmail: string | null;
  userName: string | null;
}

/** A friendly display name for a user: their set name, else the email's local part. */
export function userDisplayName(m: { userName: string | null; userEmail: string | null }): string {
  if (m.userName?.trim()) return m.userName.trim();
  const local = m.userEmail?.split("@")[0] ?? "";
  return local ? local.charAt(0).toUpperCase() + local.slice(1) : "there";
}

/**
 * The signed-in user's operator + their role on it — the basis for RBAC.
 * `cache()`d so the layout, pages, and permission checks share one resolution.
 */
export const getSessionMembership = cache(async (): Promise<SessionMembership | null> => {
  const user = await getSessionUser();
  if (!user) return null;
  const m = await getMembershipForUser(user.id);
  if (!m) return null;
  let userEmail: string | null = null;
  let userName: string | null = null;
  try {
    const { data } = await createAdminClient().auth.admin.getUserById(user.id);
    userEmail = data?.user?.email ?? null;
    userName = ((data?.user?.user_metadata?.name as string | undefined) ?? "").trim() || null;
  } catch {
    /* best-effort — fall back to email-less display */
  }
  return { ...m, userId: user.id, userEmail, userName };
});

/** Backwards-compatible: the current operator (without the role). Reuses the
 *  cached membership resolution, so it's not an extra query. */
export const getSessionOperator = cache(async (): Promise<Operator | null> => {
  return (await getSessionMembership())?.operator ?? null;
});

/** True when the signed-in user is an admin of their operator. */
export async function isSessionAdmin(): Promise<boolean> {
  return (await getSessionMembership())?.role === "admin";
}

/**
 * Guard for admin-only server actions. Returns the membership when the caller is
 * an admin, or a typed error result to return directly from the action.
 */
export async function requireAdmin(): Promise<
  { ok: true; membership: SessionMembership } | { ok: false; error: string }
> {
  const m = await getSessionMembership();
  if (!m) return { ok: false, error: "Not signed in." };
  if (m.role !== "admin") return { ok: false, error: "Only admins can do that." };
  return { ok: true, membership: m };
}
