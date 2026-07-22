import { CastleTurret, Tent, Chair, Package } from "@phosphor-icons/react/dist/ssr";

/** Catalog category taxonomy — shared across the inventory list, detail, and drawer. */
export type Category = "bounce" | "tent" | "tables" | "other";

export const CATS: { value: Category; label: string; Icon: typeof Tent; tint: string; ink: string }[] = [
  { value: "bounce", label: "Bounce house", Icon: CastleTurret, tint: "bg-brand-tint", ink: "text-brand" },
  { value: "tent", label: "Tent", Icon: Tent, tint: "bg-teal-tint", ink: "text-teal" },
  { value: "tables", label: "Tables & chairs", Icon: Chair, tint: "bg-amber-tint", ink: "text-amber-deep" },
  { value: "other", label: "Other", Icon: Package, tint: "bg-sand", ink: "text-ink-soft" },
];

export const catMeta = (c: string | null) => CATS.find((x) => x.value === c) ?? CATS[3];
export const money = (cents: number) => `$${(cents / 100).toLocaleString("en-US")}`;
export const unitLabel = (u: string) => (u === "per_hour" ? "/ hour" : u === "flat" ? "flat" : "/ day");

export function Field({
  label,
  children,
  className = "",
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1 block text-[13px] font-bold text-ink-soft">{label}</span>
      {children}
    </label>
  );
}
