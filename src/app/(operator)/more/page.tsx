import Link from "next/link";
import { CaretRight } from "@phosphor-icons/react/dist/ssr";
import { getSessionMembership, userDisplayName } from "@/lib/operator/session";
import { roleLabel } from "@/lib/operator/roles";
import { MORE_ITEMS } from "@/lib/operator/nav";
import { SignOutButton } from "@/components/operator/SignOutButton";

function initialsOf(name: string): string {
  return name.split(/\s+/).map((p) => p[0]).join("").slice(0, 2).toUpperCase();
}

/** The mobile "More" screen — the overflow nav the bottom bar doesn't show, plus
 *  the account block. Employees don't see admin-only entries (Documents, Promos,
 *  Settings). On desktop the sidebar covers all of this; this is the phone route. */
export default async function MorePage() {
  const membership = await getSessionMembership();
  const role = membership?.role ?? "employee";
  const userDisplay = membership ? userDisplayName(membership) : "Account";
  const items = MORE_ITEMS.filter((n) => role === "admin" || !n.adminOnly);

  return (
    <div className="mx-auto max-w-lg px-4 py-5">
      <h1 className="font-display text-2xl font-bold text-ink">More</h1>

      {/* Account */}
      <Link
        href="/account"
        className="mt-4 flex items-center gap-3 rounded-2xl border border-sand-line bg-white p-3 hover:bg-cream"
      >
        <span className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl bg-brand font-display text-sm font-extrabold text-white">
          {initialsOf(userDisplay)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-bold text-ink">{userDisplay}</span>
          <span className="block truncate text-[13px] font-medium text-ink-mute">
            {roleLabel(role)} · Account settings
          </span>
        </span>
        <CaretRight size={16} weight="bold" className="flex-shrink-0 text-ink-faint" />
      </Link>

      {/* Overflow nav */}
      <div className="mt-4 divide-y divide-sand-line overflow-hidden rounded-2xl border border-sand-line bg-white">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <Link key={item.href} href={item.href} className="flex items-center gap-3 p-3.5 hover:bg-cream">
              <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-brand/10 text-brand">
                <Icon size={19} weight="fill" />
              </span>
              <span className="flex-1 font-bold text-ink">{item.label}</span>
              <CaretRight size={16} weight="bold" className="flex-shrink-0 text-ink-faint" />
            </Link>
          );
        })}
      </div>

      {/* Sign out */}
      <div className="mt-4 overflow-hidden rounded-2xl border border-sand-line bg-white">
        <SignOutButton />
      </div>
    </div>
  );
}
