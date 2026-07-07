import { ChatCircleDots, Package, Heart, Sparkle } from "@phosphor-icons/react/dist/ssr";
import type { Icon } from "@phosphor-icons/react";

export interface StoreNavItem {
  /** Path appended to the storefront base (`/s/[slug]`); "" is the Chat home. */
  sub: string;
  label: string;
  icon: Icon;
}

export const STORE_NAV: StoreNavItem[] = [
  { sub: "", label: "Chat", icon: ChatCircleDots },
  { sub: "/inventory", label: "Inventory", icon: Package },
  { sub: "/saved", label: "Saved", icon: Heart },
  { sub: "/inspiration", label: "Inspiration", icon: Sparkle },
];

/** Whether a nav item is active for the current path. Chat matches the base
 *  exactly; the rest match their sub-path (and any nested route under it). */
export function isStoreNavActive(pathname: string, base: string, sub: string): boolean {
  if (sub === "") return pathname === base || pathname === `${base}/`;
  const href = `${base}${sub}`;
  return pathname === href || pathname.startsWith(`${href}/`);
}
