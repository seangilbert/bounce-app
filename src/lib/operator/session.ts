import { cache } from "react";
import { headers, cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { listMembershipsForUser } from "@/lib/inventory/repo";
import { ACTIVE_OPERATOR_COOKIE, pickActiveMembership, type Membership } from "@/lib/operator/active-operator";
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

  // No header — an API route the middleware doesn't gate. Verify for real, but
  // do it LOCALLY: `getClaims()` checks the ES256 signature + expiry against a
  // cached public key (~1ms) instead of a ~120ms round-trip to the Auth server.
  // Same guarantee — a forged or expired token is rejected — at a fraction of
  // the cost. (Not `getSession()`, which verifies nothing.) See the note in
  // utils/supabase/middleware.ts on the revocation trade-off.
  const supabase = createClient();
  const { data } = await supabase.auth.getClaims();
  const id = data?.claims?.sub;
  return id ? { id } : null;
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

/** Every operator the signed-in user belongs to (with role), oldest first.
 *  `cache()`d so the switcher + session resolution share one query. */
export const listSessionMemberships = cache(async (): Promise<Membership[]> => {
  const user = await getSessionUser();
  if (!user) return [];
  return listMembershipsForUser(user.id);
});

/**
 * The signed-in user's *active* operator + their role on it — the basis for RBAC.
 * Honors the active-operator cookie when the user is a member of several teams
 * (else falls back to their earliest). `cache()`d so the layout, pages, and
 * permission checks share one resolution.
 */
export const getSessionMembership = cache(async (): Promise<SessionMembership | null> => {
  const user = await getSessionUser();
  if (!user) return null;
  const memberships = await listSessionMemberships();
  const activeId = cookies().get(ACTIVE_OPERATOR_COOKIE)?.value ?? null;
  const m = pickActiveMembership(memberships, activeId);
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

export interface OperatorOption {
  id: string;
  name: string;
  role: MemberRole;
  active: boolean;
}

/** Operators to show in the switcher — empty unless the user is on more than one
 *  team (no switcher needed for a single-operator user). `cache()`d. */
export const getSessionOperatorOptions = cache(async (): Promise<OperatorOption[]> => {
  const memberships = await listSessionMemberships();
  if (memberships.length <= 1) return [];
  const active = await getSessionMembership();
  return memberships.map((m) => ({
    id: m.operator.id,
    name: m.operator.name,
    role: m.role,
    active: m.operator.id === active?.operator.id,
  }));
});
