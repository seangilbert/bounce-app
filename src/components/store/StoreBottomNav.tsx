"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { STORE_NAV, isStoreNavActive, type StoreNavItem } from "@/lib/store/nav";

function Tab({ href, item, active }: { href: string; item: StoreNavItem; active: boolean }) {
  const { icon: Icon, label } = item;
  return (
    <Link
      href={href}
      className="flex flex-1 flex-col items-center gap-1"
      aria-current={active ? "page" : undefined}
    >
      <Icon size={23} weight={active ? "fill" : "regular"} className={active ? "text-brand" : "text-ink-faint"} />
      <span className={`text-[10px] font-bold ${active ? "text-brand" : "text-ink-faint"}`}>{label}</span>
    </Link>
  );
}

/**
 * Storefront mobile tab bar (hidden on desktop, where the rail takes over).
 * Not positioned itself — the shell wraps it in the fixed bottom stack so the
 * cart bar can sit above it.
 */
export function StoreBottomNav({ base }: { base: string }) {
  const pathname = usePathname();
  return (
    <nav
      className="flex items-stretch justify-around border-t border-sand bg-white px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2.5"
      aria-label="Primary"
    >
      {STORE_NAV.map((item) => (
        <Tab
          key={item.sub || "chat"}
          href={`${base}${item.sub}`}
          item={item}
          active={isStoreNavActive(pathname, base, item.sub)}
        />
      ))}
    </nav>
  );
}
