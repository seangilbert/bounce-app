"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Confetti, SignOut } from "@phosphor-icons/react/dist/ssr";
import { NAV, navForRole, type NavItem } from "@/lib/operator/nav";
import { roleLabel, type MemberRole } from "@/lib/operator/roles";
import { OperatorSwitcher } from "./OperatorSwitcher";
import type { OperatorOption } from "@/lib/operator/session";
import { calFilters, type CatFilter } from "@/lib/operator/calendar";
import { createClient } from "@/utils/supabase/client";
import type { Operator } from "@/lib/inventory/types";

function initialsOf(name: string): string {
  return name.split(/\s+/).map((p) => p[0]).join("").slice(0, 2).toUpperCase();
}

const SETTINGS = NAV.find((n) => n.href === "/settings");

function NavLink({ item }: { item: NavItem }) {
  const pathname = usePathname();
  const { href, label, icon: Icon, badge } = item;
  const active = pathname === href || pathname.startsWith(`${href}/`);
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`flex items-center gap-3 rounded-2xl px-4 py-3 text-[15px] font-bold transition-colors ${
        active ? "bg-brand-tint text-brand-deep" : "text-ink-soft hover:bg-sand/60"
      }`}
    >
      <Icon size={22} weight={active ? "fill" : "regular"} />
      <span className="flex-1">{label}</span>
      {badge ? (
        <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-brand px-1.5 text-[11px] font-extrabold text-white">
          {badge}
        </span>
      ) : null}
    </Link>
  );
}

/** Desktop-only persistent sidebar (hidden on mobile, where the bottom bar takes over). */
export function Sidebar({
  operator,
  role,
  userDisplay,
  needsCount,
  operatorOptions = [],
}: {
  operator: Operator | null;
  role: MemberRole;
  userDisplay: string;
  needsCount: number;
  operatorOptions?: OperatorOption[];
}) {
  const mainNav = navForRole(role).filter((n) => n.href !== "/settings");
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const onCalendar = pathname === "/calendar" || pathname.startsWith("/calendar/");
  const activeCat = (searchParams.get("cat") ?? "all") as CatFilter;

  // Keep the current month (y/m) when switching the item filter.
  const filterHref = (cat: CatFilter) => {
    const p = new URLSearchParams();
    const y = searchParams.get("y");
    const m = searchParams.get("m");
    if (y) p.set("y", y);
    if (m) p.set("m", m);
    if (cat !== "all") p.set("cat", cat);
    const qs = p.toString();
    return qs ? `/calendar?${qs}` : "/calendar";
  };

  async function signOut() {
    await createClient().auth.signOut();
    router.push("/login");
    router.refresh();
  }

  const business = operator?.name ?? "Your business";
  const location = operator?.location ?? "";

  return (
    <aside className="hidden w-[272px] flex-shrink-0 flex-col overflow-y-auto border-r border-sand bg-cream px-4 py-5 lg:flex lg:h-dvh">
      {/* Brand */}
      <div className="flex items-center gap-3 px-2 pb-7 pt-1">
        {operator?.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={operator.logoUrl} alt={business} className="h-11 w-11 flex-shrink-0 rounded-2xl object-contain" />
        ) : (
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand text-white">
            <Confetti size={22} weight="fill" />
          </span>
        )}
        <div className="min-w-0">
          <div className="font-display text-[17px] font-extrabold leading-tight tracking-tight text-ink">
            {business}
          </div>
          <div className="text-[12.5px] font-semibold text-ink-mute">{location}</div>
        </div>
      </div>

      {/* Operator switcher — only when the user belongs to more than one team */}
      {operatorOptions.length > 1 ? (
        <div className="-mt-3 mb-5 px-1">
          <OperatorSwitcher options={operatorOptions} />
        </div>
      ) : null}

      {/* Primary nav */}
      <nav className="flex flex-col gap-1" aria-label="Primary">
        {mainNav.map((item) => (
          <NavLink
            key={item.href}
            item={item.href === "/inquiries" ? { ...item, badge: needsCount || undefined } : item}
          />
        ))}
      </nav>

      {/* Calendar-only: filter by item category */}
      {onCalendar ? (
        <div className="mt-7 px-2">
          <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-ink-faint">
            Filter by item
          </div>
          <div className="mt-2 flex flex-col gap-0.5">
            {calFilters.map((f) => {
              const active = activeCat === f.cat;
              return (
                <Link
                  key={f.cat}
                  href={filterHref(f.cat)}
                  aria-current={active ? "true" : undefined}
                  className={`flex items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors ${
                    active ? "bg-brand-tint" : "hover:bg-sand/60"
                  }`}
                >
                  <span className={`h-2.5 w-2.5 rounded-full ${f.dot}`} />
                  <span
                    className={`text-[14px] ${active ? "font-extrabold text-brand-deep" : "font-semibold text-ink-soft"}`}
                  >
                    {f.label}
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      ) : null}

      {/* Settings + account, pinned to the bottom */}
      <div className="mt-auto flex flex-col gap-1 pt-4">
        {SETTINGS && role === "admin" ? <NavLink item={SETTINGS} /> : null}
        <div className="mt-1 flex items-center gap-2 rounded-2xl bg-sand/50 px-3 py-2.5">
          <Link href="/account" className="flex min-w-0 flex-1 items-center gap-2" title="Your account">
            <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl bg-brand font-display text-sm font-extrabold text-white">
              {initialsOf(userDisplay)}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[15px] font-bold text-ink">{userDisplay}</span>
              <span className="block truncate text-[13px] font-medium text-ink-mute">{roleLabel(role)}</span>
            </span>
          </Link>
          <button
            onClick={signOut}
            className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-ink-mute transition-colors hover:bg-sand hover:text-ink"
            aria-label="Sign out"
            title="Sign out"
          >
            <SignOut size={17} weight="bold" />
          </button>
        </div>
      </div>
    </aside>
  );
}
