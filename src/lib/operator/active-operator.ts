import type { Operator } from "@/lib/inventory/types";
import type { MemberRole } from "@/lib/operator/roles";

/** Cookie holding the operator the user is currently viewing (when on >1 team). */
export const ACTIVE_OPERATOR_COOKIE = "bounce_active_operator";

export type Membership = { operator: Operator; role: MemberRole };

/**
 * Pick the membership a session should resolve to. Honors the active-operator
 * choice when the user actually belongs to that operator (so a stale/forged
 * cookie can never select an operator they aren't a member of); otherwise falls
 * back to the first (earliest) membership. Pure — the single source of truth for
 * which operator the app is scoped to.
 */
export function pickActiveMembership(
  memberships: Membership[],
  activeOperatorId: string | null | undefined,
): Membership | null {
  if (memberships.length === 0) return null;
  if (activeOperatorId) {
    const chosen = memberships.find((m) => m.operator.id === activeOperatorId);
    if (chosen) return chosen;
  }
  return memberships[0];
}
