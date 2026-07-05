"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Confetti } from "@phosphor-icons/react/dist/ssr";
import { NAV } from "@/lib/operator/nav";
import { operator } from "@/lib/operator/mock";

/** Desktop-only persistent sidebar (hidden on mobile, where the bottom bar takes over). */
export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden w-64 flex-shrink-0 flex-col border-r border-sand bg-cream px-3 py-6 lg:sticky lg:top-0 lg:flex lg:h-dvh">
      {/* Brand */}
      <div className="flex items-center gap-2.5 px-2 pb-6">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand text-white">
          <Confetti size={20} weight="fill" />
        </span>
        <span className="font-display text-lg font-extrabold tracking-tight text-ink">
          Bounce USA
        </span>
      </div>

      {/* Nav */}
      <nav className="flex flex-1 flex-col gap-1" aria-label="Primary">
        {NAV.map(({ href, label, icon: Icon, badge }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={`flex items-center gap-3 rounded-[13px] px-3.5 py-3 text-sm font-bold transition-colors ${
                active
                  ? "bg-brand-tint text-brand-deep"
                  : "text-ink-soft hover:bg-sand/60"
              }`}
            >
              <Icon size={21} weight={active ? "fill" : "regular"} />
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

      {/* User */}
      <div className="mt-4 flex items-center gap-2.5 rounded-[13px] bg-white px-2.5 py-2.5">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand font-display text-sm font-extrabold text-white">
          {operator.initials}
        </span>
        <div className="min-w-0">
          <div className="truncate text-[13px] font-bold text-ink">{operator.firstName}</div>
          <div className="truncate text-[11px] font-semibold text-ink-mute">
            {operator.business}
          </div>
        </div>
      </div>
    </aside>
  );
}
