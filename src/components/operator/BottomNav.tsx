"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  House,
  CalendarDots,
  ChatCircleDots,
  Truck,
  SquaresFour,
} from "@phosphor-icons/react/dist/ssr";
import type { Icon } from "@phosphor-icons/react";

interface Tab {
  href: string;
  label: string;
  icon: Icon;
  badge?: number;
}

const TABS: Tab[] = [
  { href: "/dashboard", label: "Home", icon: House },
  { href: "/calendar", label: "Calendar", icon: CalendarDots },
  { href: "/inquiries", label: "Inquiries", icon: ChatCircleDots, badge: 1 },
  { href: "/deliveries", label: "Deliveries", icon: Truck },
  { href: "/more", label: "More", icon: SquaresFour },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-30 mx-auto flex max-w-md items-stretch justify-around border-t border-sand bg-white px-2 pt-2.5 pb-[max(0.5rem,env(safe-area-inset-bottom))]"
      aria-label="Primary"
    >
      {TABS.map(({ href, label, icon: Icon, badge }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
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
            <span
              className={`text-[10px] font-bold ${active ? "text-brand" : "text-ink-faint"}`}
            >
              {label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
