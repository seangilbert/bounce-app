import {
  House,
  CalendarDots,
  ChatCircleDots,
  Truck,
  Package,
  AddressBook,
  Tag,
  Files,
  GearSix,
  DotsThreeOutline,
} from "@phosphor-icons/react/dist/ssr";
import type { Icon } from "@phosphor-icons/react";

export interface NavItem {
  href: string;
  label: string;
  /** Shorter label for the mobile tab bar (falls back to `label`). */
  mobileLabel?: string;
  icon: Icon;
  badge?: number;
  /** Only shown to admins (employees are redirected from these pages too). */
  adminOnly?: boolean;
}

/** Full nav — the desktop sidebar shows all of these. */
export const NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", mobileLabel: "Home", icon: House },
  { href: "/calendar", label: "Calendar", icon: CalendarDots },
  { href: "/inquiries", label: "Inquiries", icon: ChatCircleDots },
  { href: "/deliveries", label: "Deliveries", icon: Truck },
  { href: "/customers", label: "Customers", icon: AddressBook },
  { href: "/inventory", label: "Inventory", icon: Package },
  { href: "/documents", label: "Documents", icon: Files, adminOnly: true },
  { href: "/promos", label: "Promos", icon: Tag, adminOnly: true },
  { href: "/settings", label: "Settings", icon: GearSix, adminOnly: true },
];

/** Nav visible to a given role (employees don't see admin-only entries). */
export function navForRole(role: "admin" | "employee"): NavItem[] {
  return role === "admin" ? NAV : NAV.filter((n) => !n.adminOnly);
}

/** Mobile bottom bar: four primary tabs + a "More" entry for the rest. */
export const MOBILE_PRIMARY = NAV.slice(0, 4);
export const MORE_TAB: NavItem = { href: "/more", label: "More", icon: DotsThreeOutline };
export const MORE_ITEMS = NAV.slice(4); // Inventory, Settings
