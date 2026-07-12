import { getInviteByToken } from "@/lib/operator/members";
import { getSessionUser } from "@/lib/operator/session";
import { createAdminClient } from "@/utils/supabase/admin";
import { InviteAccept } from "@/components/operator/InviteAccept";

export const dynamic = "force-dynamic";

export default async function InvitePage({ params }: { params: { token: string } }) {
  const invite = await getInviteByToken(params.token);

  if (!invite) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-cream px-6">
        <div className="max-w-sm rounded-2xl border border-sand bg-white p-6 text-center">
          <h1 className="font-display text-xl font-bold text-ink">Invitation unavailable</h1>
          <p className="mt-2 text-sm font-medium text-ink-mute">
            This invitation is invalid, was revoked, or has expired. Ask an admin to send a new one.
          </p>
        </div>
      </div>
    );
  }

  const user = await getSessionUser();
  let sessionEmail: string | null = null;
  if (user) {
    const { data } = await createAdminClient().auth.admin.getUserById(user.id);
    sessionEmail = data?.user?.email ?? null;
  }
  return (
    <InviteAccept
      token={params.token}
      operatorName={invite.operatorName}
      email={invite.email}
      role={invite.role}
      sessionEmail={sessionEmail}
    />
  );
}
