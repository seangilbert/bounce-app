"use server";

import { getSessionUser } from "@/lib/operator/session";
import { acceptInvite, getInviteByToken } from "@/lib/operator/members";
import { createAdminClient } from "@/utils/supabase/admin";

export type ActionResult = { ok: true } | { ok: false; error: string };

/** Accept an invite as the already-signed-in user. */
export async function acceptInviteAction(token: string): Promise<ActionResult> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "Please sign in first." };
  return acceptInvite(token, user.id);
}

/**
 * Accept an invite by creating a new account for the invited email. Returns the
 * email so the client can sign in. Existing accounts are told to sign in instead
 * (we never set a password for an account that already exists).
 */
export async function acceptInviteWithSignupAction(input: {
  token: string;
  password: string;
}): Promise<{ ok: true; email: string } | { ok: false; error: string }> {
  const invite = await getInviteByToken(input.token);
  if (!invite) return { ok: false, error: "This invitation is no longer valid." };
  if ((input.password ?? "").length < 8) return { ok: false, error: "Password must be at least 8 characters." };

  const admin = createAdminClient();
  const created = await admin.auth.admin.createUser({
    email: invite.email,
    password: input.password,
    email_confirm: true,
  });
  if (created.error) {
    const dup = /already|registered|exists/i.test(created.error.message);
    return {
      ok: false,
      error: dup ? "You already have an account — sign in, then reopen this link." : created.error.message,
    };
  }

  const res = await acceptInvite(input.token, created.data.user.id);
  if (!res.ok) {
    await admin.auth.admin.deleteUser(created.data.user.id).catch(() => {});
    return res;
  }
  return { ok: true, email: invite.email };
}
