/** Team roles for operator_members. `admin` = full access (settings, billing,
 *  team, money movement); `employee` = day-to-day operations only. */
export type MemberRole = "admin" | "employee";

export const MEMBER_ROLES: MemberRole[] = ["admin", "employee"];

export function roleLabel(role: MemberRole): string {
  return role === "admin" ? "Admin" : "Employee";
}

export function isMemberRole(v: unknown): v is MemberRole {
  return v === "admin" || v === "employee";
}
