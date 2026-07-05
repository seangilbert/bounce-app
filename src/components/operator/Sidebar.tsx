"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Confetti } from "@phosphor-icons/react/dist/ssr";
import { NAV } from "@/lib/operator/nav";
import { operator } from "@/lib/operator/mock";

// The desktop sidebar shows the primary destinations (Settings lives under
// "More" on mobile and isn't surfaced in the rail).
const SIDEBAR_NAV = NAV.filter((n) => n.href !== "/settings");

/** Desktop-only persistent sidebar (hidden on mobile, where the bottom bar takes over). */
export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden w-[272px] flex-shrink-0 flex-col border-r border-sand bg-cream px-4 py-5 lg:sticky lg:top-0 lg:flex lg:h-dvh">
      {/* Brand */}
      <div className="flex items-center gap-3 px-2 pb-7 pt-1">
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand text-white">
          <Confetti size={22} weight="fill" />
        </span>
        <div className="min-w-0">
          <div className="font-display text-[17px] font-extrabold leading-tight tracking-tight text-ink">
            {operator.business}
          </div>
          <div className="text-[12.5px] font-semibold text-ink-mute">{operator.location}</div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex flex-col gap-1" aria-label="Primary">
        {SIDEBAR_NAV.map(({ href, label, icon: Icon, badge }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={href}
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
        })}
      </nav>
    </aside>
  );
}
