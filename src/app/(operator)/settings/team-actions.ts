"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/operator/session";
import { planCapabilities } from "@/lib/plans";
import {
  createInvite,
  revokeInvite,
  updateMemberRole,
  removeMember,
  updateMemberEmail,
} from "@/lib/operator/members";
import { isMemberRole, type MemberRole } from "@/lib/operator/roles";
import { sendEmail } from "@/lib/email/send";

export type ActionResult = { ok: true } | { ok: false; error: string };

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function appBase(): string {
  const h = headers();
  const host = h.get("host");
  const proto = h.get("x-forwarded-proto") ?? (host?.includes("localhost") ? "http" : "https");
  if (host) return `${proto}://${host}`;
  return process.env.NEXT_PUBLIC_APP_URL ?? "https://bounce-app.vercel.app";
}

export async function inviteMemberAction(input: {
  email: string;
  role: MemberRole;
}): Promise<{ ok: true; inviteUrl: string } | { ok: false; error: string }> {
  const g = await requireAdmin();
  if (!g.ok) return { ok: false, error: g.error };
  const { operator, userId } = g.membership;
  if (!planCapabilities(operator).teamMembers)
    return { ok: false, error: "Adding team members requires the Growing plan." };

  const email = (input.email ?? "").trim();
  if (!EMAIL_RE.test(email)) return { ok: false, error: "Enter a valid email." };
  const role = isMemberRole(input.role) ? input.role : "employee";

  const res = await createInvite(operator.id, email, role, userId);
  if (!res.ok) return res;

  const inviteUrl = `${appBase()}/invite/${res.token}`;
  try {
    await sendEmail({
      to: email,
      subject: `You're invited to join ${operator.name} on Movables`,
      html:
        `<p><strong>${operator.name}</strong> invited you to join their team on Movables as ` +
        `${role === "admin" ? "an admin" : "an employee"}.</p>` +
        `<p><a href="${inviteUrl}">Accept the invitation</a> — this link expires in 7 days.</p>`,
    });
  } catch {
    /* email best-effort — the admin can also copy the link */
  }

  revalidatePath("/settings");
  return { ok: true, inviteUrl };
}

export async function updateMemberRoleAction(input: {
  userId: string;
  role: MemberRole;
}): Promise<ActionResult> {
  const g = await requireAdmin();
  if (!g.ok) return { ok: false, error: g.error };
  if (!isMemberRole(input.role)) return { ok: false, error: "Invalid role." };
  const res = await updateMemberRole(g.membership.operator.id, input.userId, input.role);
  revalidatePath("/settings");
  return res;
}

export async function removeMemberAction(userId: string): Promise<ActionResult> {
  const g = await requireAdmin();
  if (!g.ok) return { ok: false, error: g.error };
  if (userId === g.membership.userId) return { ok: false, error: "You can't remove yourself." };
  const res = await removeMember(g.membership.operator.id, userId);
  revalidatePath("/settings");
  return res;
}

export async function revokeInviteAction(id: string): Promise<ActionResult> {
  const g = await requireAdmin();
  if (!g.ok) return { ok: false, error: g.error };
  const res = await revokeInvite(g.membership.operator.id, id);
  revalidatePath("/settings");
  return res;
}

export async function updateMemberEmailAction(input: {
  userId: string;
  email: string;
}): Promise<ActionResult> {
  const g = await requireAdmin();
  if (!g.ok) return { ok: false, error: g.error };
  if (!EMAIL_RE.test((input.email ?? "").trim())) return { ok: false, error: "Enter a valid email." };
  const res = await updateMemberEmail(input.userId, input.email);
  revalidatePath("/settings");
  return res;
}
