import {
  House,
  CalendarDots,
  ChatCircleDots,
  Truck,
  Package,
  AddressBook,
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
}

/** Full nav — the desktop sidebar shows all of these. */
export const NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", mobileLabel: "Home", icon: House },
  { href: "/calendar", label: "Calendar", icon: CalendarDots },
  { href: "/inquiries", label: "Inquiries", icon: ChatCircleDots },
  { href: "/deliveries", label: "Deliveries", icon: Truck },
  { href: "/customers", label: "Customers", icon: AddressBook },
  { href: "/inventory", label: "Inventory", icon: Package },
  { href: "/settings", label: "Settings", icon: GearSix },
];

/** Mobile bottom bar: four primary tabs + a "More" entry for the rest. */
export const MOBILE_PRIMARY = NAV.slice(0, 4);
export const MORE_TAB: NavItem = { href: "/more", label: "More", icon: DotsThreeOutline };
export const MORE_ITEMS = NAV.slice(4); // Inventory, Settings
