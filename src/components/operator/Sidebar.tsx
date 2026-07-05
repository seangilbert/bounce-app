"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Confetti, CaretUpDown } from "@phosphor-icons/react/dist/ssr";
import { NAV, type NavItem } from "@/lib/operator/nav";
import { calFilters } from "@/lib/operator/calendar";
import type { Operator } from "@/lib/inventory/types";

function initialsOf(name: string): string {
  return name.split(/\s+/).map((p) => p[0]).join("").slice(0, 2).toUpperCase();
}

const MAIN_NAV = NAV.filter((n) => n.href !== "/settings");
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
  needsCount,
}: {
  operator: Operator | null;
  needsCount: number;
}) {
  const pathname = usePathname();
  const onCalendar = pathname === "/calendar" || pathname.startsWith("/calendar/");

  const business = operator?.name ?? "Your business";
  const location = operator?.location ?? "";
  const ownerName = operator?.ownerName ?? operator?.name ?? "Account";
  const planLabel = operator?.plan
    ? `${operator.plan[0].toUpperCase()}${operator.plan.slice(1)} plan`
    : "";

  return (
    <aside className="hidden w-[272px] flex-shrink-0 flex-col border-r border-sand bg-cream px-4 py-5 lg:sticky lg:top-0 lg:flex lg:h-dvh">
      {/* Brand */}
      <div className="flex items-center gap-3 px-2 pb-7 pt-1">
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand text-white">
          <Confetti size={22} weight="fill" />
        </span>
        <div className="min-w-0">
          <div className="font-display text-[17px] font-extrabold leading-tight tracking-tight text-ink">
            {business}
          </div>
          <div className="text-[12.5px] font-semibold text-ink-mute">{location}</div>
        </div>
      </div>

      {/* Primary nav */}
      <nav className="flex flex-col gap-1" aria-label="Primary">
        {MAIN_NAV.map((item) => (
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
          <div className="mt-3 flex flex-col gap-2.5">
            {calFilters.map((f) => (
              <div key={f.label} className="flex items-center gap-2.5">
                <span className={`h-2.5 w-2.5 rounded-full ${f.dot}`} />
                <span
                  className={`text-[14px] ${f.active ? "font-extrabold text-ink" : "font-semibold text-ink-soft"}`}
                >
                  {f.label}
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* Settings + account, pinned to the bottom */}
      <div className="mt-auto flex flex-col gap-1 pt-4">
        {SETTINGS ? <NavLink item={SETTINGS} /> : null}
        <button className="mt-1 flex items-center gap-3 rounded-2xl bg-sand/50 px-3 py-3 text-left transition-colors hover:bg-sand/70">
          <span className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl bg-brand font-display text-sm font-extrabold text-white">
            {initialsOf(ownerName)}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[15px] font-bold text-ink">{ownerName}</span>
            <span className="block truncate text-[13px] font-medium text-ink-mute">{planLabel}</span>
          </span>
          <CaretUpDown size={18} className="flex-shrink-0 text-ink-faint" />
        </button>
      </div>
    </aside>
  );
}
