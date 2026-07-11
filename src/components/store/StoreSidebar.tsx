"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Confetti, Phone, SignIn } from "@phosphor-icons/react/dist/ssr";
import { STORE_NAV, isStoreNavActive, type StoreNavItem } from "@/lib/store/nav";

function NavLink({ href, item, active }: { href: string; item: StoreNavItem; active: boolean }) {
  const { label, icon: Icon } = item;
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
    </Link>
  );
}

/**
 * Storefront left rail (desktop only; the bottom bar takes over on mobile).
 * Same shape as the operator sidebar: brand → nav → account pinned to the
 * bottom. The account block is a guest placeholder — there's no customer auth
 * yet, so "Sign in" is inert.
 */
export function StoreSidebar({
  base,
  operatorName,
  logoUrl,
  phone,
}: {
  base: string;
  operatorName: string;
  logoUrl?: string | null;
  phone?: string;
}) {
  const pathname = usePathname();

  return (
    <aside className="hidden w-[248px] flex-shrink-0 flex-col overflow-y-auto border-r border-sand bg-cream px-4 py-5 lg:flex lg:h-dvh">
      {/* Brand */}
      <div className="flex items-center gap-3 px-2 pb-7 pt-1">
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoUrl} alt={operatorName} className="h-11 w-11 flex-shrink-0 rounded-2xl object-contain" />
        ) : (
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand text-white">
            <Confetti size={22} weight="fill" />
          </span>
        )}
        <div className="min-w-0">
          <div className="truncate font-display text-[17px] font-extrabold leading-tight tracking-tight text-ink">
            {operatorName}
          </div>
          <div className="text-[12.5px] font-semibold text-ink-mute">Party &amp; event rentals</div>
        </div>
      </div>

      {/* Primary nav */}
      <nav className="flex flex-col gap-1" aria-label="Primary">
        {STORE_NAV.map((item) => {
          const href = `${base}${item.sub}`;
          return (
            <NavLink
              key={item.sub || "chat"}
              href={href}
              item={item}
              active={isStoreNavActive(pathname, base, item.sub)}
            />
          );
        })}
      </nav>

      {/* Contact + guest account, pinned to the bottom */}
      <div className="mt-auto flex flex-col gap-2 pt-4">
        {phone ? (
          <a
            href={`tel:${phone.replace(/[^0-9+]/g, "")}`}
            className="flex items-center gap-3 rounded-2xl px-4 py-3 text-[15px] font-bold text-ink-soft transition-colors hover:bg-sand/60"
          >
            <Phone size={22} weight="regular" />
            <span className="flex-1">{phone}</span>
          </a>
        ) : null}
        <div className="flex items-center gap-2 rounded-2xl bg-sand/50 px-3 py-2.5">
          <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl bg-brand font-display text-sm font-extrabold text-white">
            G
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[15px] font-bold text-ink">Guest</span>
            <span className="block truncate text-[13px] font-medium text-ink-mute">Not signed in</span>
          </span>
          <button
            type="button"
            className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-ink-mute transition-colors hover:bg-sand hover:text-ink"
            aria-label="Sign in"
            title="Sign in"
          >
            <SignIn size={17} weight="bold" />
          </button>
        </div>
        <div className="flex items-center justify-center gap-2 px-2 text-[12px] font-medium text-ink-faint">
          <Link href="/terms" className="hover:text-ink-mute">
            Terms
          </Link>
          <span aria-hidden>·</span>
          <Link href="/privacy" className="hover:text-ink-mute">
            Privacy
          </Link>
        </div>
      </div>
    </aside>
  );
}
