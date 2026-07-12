import { redirect } from "next/navigation";
import { getSessionMembership } from "@/lib/operator/session";
import { createAdminClient } from "@/utils/supabase/admin";
import { roleLabel } from "@/lib/operator/roles";
import { AccountManager } from "@/components/operator/AccountManager";

export const dynamic = "force-dynamic";

/** Self-service account management — available to every member regardless of
 *  role (Settings is admin-only, so this is where employees manage their login). */
export default async function AccountPage() {
  const membership = await getSessionMembership();
  if (!membership) redirect("/login");
  const { data } = await createAdminClient().auth.admin.getUserById(membership.userId);
  const email = data?.user?.email ?? "";

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-5 px-5 py-6 lg:px-8">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight text-ink lg:text-[28px]">Your account</h1>
        <p className="mt-1 text-sm font-medium text-ink-mute">
          {membership.operator.name} · {roleLabel(membership.role)}
        </p>
      </div>
      <AccountManager currentEmail={email} />
    </div>
  );
}
