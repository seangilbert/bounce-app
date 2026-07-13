"use server";

import { cookies } from "next/headers";
import { getSessionUser } from "@/lib/operator/session";
import { listMembershipsForUser } from "@/lib/inventory/repo";
import { ACTIVE_OPERATOR_COOKIE } from "@/lib/operator/active-operator";

/** Switch the active operator for a multi-team user. Only sets the cookie if the
 *  caller actually belongs to the target operator (can't switch into a team
 *  you're not on). The client refreshes afterward to re-resolve the session. */
export async function setActiveOperatorAction(operatorId: string): Promise<{ ok: boolean }> {
  const user = await getSessionUser();
  if (!user) return { ok: false };
  const memberships = await listMembershipsForUser(user.id);
  if (!memberships.some((m) => m.operator.id === operatorId)) return { ok: false };
  cookies().set(ACTIVE_OPERATOR_COOKIE, operatorId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  return { ok: true };
}
