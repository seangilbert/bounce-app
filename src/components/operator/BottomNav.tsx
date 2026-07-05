"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MOBILE_PRIMARY, MORE_TAB, type NavItem } from "@/lib/operator/nav";

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function Tab({ item, active }: { item: NavItem; active: boolean }) {
  const { icon: Icon, badge, mobileLabel, label } = item;
  return (
    <Link
      href={item.href}
      className="flex flex-1 flex-col items-center gap-1"
      aria-current={active ? "page" : undefined}
    >
      <span className="relative">
        <Icon
          size={23}
          weight={active ? "fill" : "regular"}
          className={active ? "text-brand" : "text-ink-faint"}
        />
        {badge ? (
          <span className="absolute -right-2.5 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full border-[1.5px] border-white bg-brand px-1 text-[9px] font-extrabold text-white">
            {badge}
          </span>
        ) : null}
      </span>
      <span className={`text-[10px] font-bold ${active ? "text-brand" : "text-ink-faint"}`}>
        {mobileLabel ?? label}
      </span>
    </Link>
  );
}

/** Mobile-only bottom tab bar (hidden on desktop, where the sidebar takes over). */
export function BottomNav({ needsCount = 0 }: { needsCount?: number }) {
  const pathname = usePathname();
  const tabs = [...MOBILE_PRIMARY, MORE_TAB].map((item) =>
    item.href === "/inquiries" ? { ...item, badge: needsCount || undefined } : item,
  );
  const moreActive = !MOBILE_PRIMARY.some((t) => isActive(pathname, t.href));

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-30 flex items-stretch justify-around border-t border-sand bg-white px-2 pt-2.5 pb-[max(0.5rem,env(safe-area-inset-bottom))] lg:hidden"
      aria-label="Primary"
    >
      {tabs.map((item) => (
        <Tab
          key={item.href}
          item={item}
          active={item === MORE_TAB ? moreActive : isActive(pathname, item.href)}
        />
      ))}
    </nav>
  );
}
