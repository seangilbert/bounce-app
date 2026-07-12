import { randomBytes } from "crypto";
import { createAdminClient } from "@/utils/supabase/admin";
import type { MemberRole } from "./roles";

export interface TeamMember {
  userId: string;
  email: string | null;
  role: MemberRole;
  createdAt: string;
}

export interface TeamInvite {
  id: string;
  email: string;
  role: MemberRole;
  createdAt: string;
  expiresAt: string;
}

type Result = { ok: true } | { ok: false; error: string };

const LAST_ADMIN_MSG = "Your account needs at least one admin.";

async function countAdmins(
  db: ReturnType<typeof createAdminClient>,
  operatorId: string,
): Promise<number> {
  const { count } = await db
    .from("operator_members")
    .select("*", { count: "exact", head: true })
    .eq("operator_id", operatorId)
    .eq("role", "admin");
  return count ?? 0;
}

/** Team members for an operator, with login emails (small teams — per-user lookups are fine). */
export async function listMembers(operatorId: string): Promise<TeamMember[]> {
  const db = createAdminClient();
  const { data, error } = await db
    .from("operator_members")
    .select("user_id, role, created_at")
    .eq("operator_id", operatorId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(`listMembers failed: ${error.message}`);

  const members: TeamMember[] = [];
  for (const r of data as { user_id: string; role: MemberRole; created_at: string }[]) {
    const { data: u } = await db.auth.admin.getUserById(r.user_id);
    members.push({ userId: r.user_id, email: u?.user?.email ?? null, role: r.role, createdAt: r.created_at });
  }
  return members;
}

/** Change a member's role. Blocks demoting the only admin. */
export async function updateMemberRole(
  operatorId: string,
  targetUserId: string,
  role: MemberRole,
): Promise<Result> {
  const db = createAdminClient();
  if (role === "employee") {
    const { data: cur } = await db
      .from("operator_members")
      .select("role")
      .eq("operator_id", operatorId)
      .eq("user_id", targetUserId)
      .maybeSingle();
    if (cur?.role === "admin" && (await countAdmins(db, operatorId)) <= 1) {
      return { ok: false, error: LAST_ADMIN_MSG };
    }
  }
  const { error } = await db
    .from("operator_members")
    .update({ role })
    .eq("operator_id", operatorId)
    .eq("user_id", targetUserId);
  if (error) return { ok: false, error: "Could not update role." };
  return { ok: true };
}

/** Remove a member. Blocks removing the only admin. Leaves the auth user intact
 *  (they may belong to other operators or sign up again). */
export async function removeMember(operatorId: string, targetUserId: string): Promise<Result> {
  const db = createAdminClient();
  const { data: cur } = await db
    .from("operator_members")
    .select("role")
    .eq("operator_id", operatorId)
    .eq("user_id", targetUserId)
    .maybeSingle();
  if (!cur) return { ok: true };
  if (cur.role === "admin" && (await countAdmins(db, operatorId)) <= 1) {
    return { ok: false, error: LAST_ADMIN_MSG };
  }
  const { error } = await db
    .from("operator_members")
    .delete()
    .eq("operator_id", operatorId)
    .eq("user_id", targetUserId);
  if (error) return { ok: false, error: "Could not remove member." };
  return { ok: true };
}

/** Set a member's login email directly (admin action — no confirmation round-trip). */
export async function updateMemberEmail(targetUserId: string, email: string): Promise<Result> {
  const db = createAdminClient();
  const { error } = await db.auth.admin.updateUserById(targetUserId, {
    email: email.trim(),
    email_confirm: true,
  });
  if (error) {
    const dup = /already|registered|exists/i.test(error.message);
    return { ok: false, error: dup ? "That email is already in use." : "Could not update the email." };
  }
  return { ok: true };
}

/* ── Invites ──────────────────────────────────────────────────────────────── */

function rowToInvite(r: {
  id: string;
  email: string;
  role: MemberRole;
  created_at: string;
  expires_at: string;
}): TeamInvite {
  return { id: r.id, email: r.email, role: r.role, createdAt: r.created_at, expiresAt: r.expires_at };
}

export async function listPendingInvites(operatorId: string): Promise<TeamInvite[]> {
  const db = createAdminClient();
  const { data, error } = await db
    .from("operator_invites")
    .select("id, email, role, created_at, expires_at")
    .eq("operator_id", operatorId)
    .eq("status", "pending")
    .order("created_at", { ascending: false });
  if (error) throw new Error(`listPendingInvites failed: ${error.message}`);
  return (data as Parameters<typeof rowToInvite>[0][]).map(rowToInvite);
}

export async function createInvite(
  operatorId: string,
  email: string,
  role: MemberRole,
  invitedBy: string,
): Promise<{ ok: true; invite: TeamInvite; token: string } | { ok: false; error: string }> {
  const db = createAdminClient();
  const cleanEmail = email.trim().toLowerCase();
  const token = randomBytes(24).toString("base64url");
  const { data, error } = await db
    .from("operator_invites")
    .insert({ operator_id: operatorId, email: cleanEmail, role, token, invited_by: invitedBy })
    .select("id, email, role, created_at, expires_at")
    .single();
  if (error) {
    if (/duplicate|unique/i.test(error.message))
      return { ok: false, error: "There's already a pending invite for that email." };
    return { ok: false, error: "Could not create the invite." };
  }
  return { ok: true, invite: rowToInvite(data), token };
}

export async function revokeInvite(operatorId: string, id: string): Promise<Result> {
  const db = createAdminClient();
  const { error } = await db
    .from("operator_invites")
    .update({ status: "revoked" })
    .eq("operator_id", operatorId)
    .eq("id", id);
  if (error) return { ok: false, error: "Could not revoke the invite." };
  return { ok: true };
}

export interface PendingInvite {
  id: string;
  operatorId: string;
  operatorName: string;
  email: string;
  role: MemberRole;
}

/** Look up a still-valid pending invite by token (for the accept page). */
export async function getInviteByToken(token: string): Promise<PendingInvite | null> {
  const db = createAdminClient();
  const { data } = await db
    .from("operator_invites")
    .select("id, operator_id, email, role, status, expires_at, operators(name)")
    .eq("token", token)
    .maybeSingle();
  if (!data || data.status !== "pending" || new Date(data.expires_at as string) < new Date()) return null;
  const op = (data as { operators: { name: string } | { name: string }[] | null }).operators;
  const name = Array.isArray(op) ? op[0]?.name : op?.name;
  return {
    id: data.id as string,
    operatorId: data.operator_id as string,
    operatorName: name ?? "the team",
    email: data.email as string,
    role: data.role as MemberRole,
  };
}

/** Accept an invite: add the user to the operator and mark the invite accepted. */
export async function acceptInvite(token: string, userId: string): Promise<Result> {
  const db = createAdminClient();
  const invite = await getInviteByToken(token);
  if (!invite) return { ok: false, error: "This invite is no longer valid." };

  const { data: existing } = await db
    .from("operator_members")
    .select("id")
    .eq("operator_id", invite.operatorId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!existing) {
    const { error } = await db
      .from("operator_members")
      .insert({ operator_id: invite.operatorId, user_id: userId, role: invite.role });
    if (error) return { ok: false, error: "Could not add you to the team." };
  }
  await db
    .from("operator_invites")
    .update({ status: "accepted", accepted_at: new Date().toISOString() })
    .eq("id", invite.id);
  return { ok: true };
}
