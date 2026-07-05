import { BottomNav } from "@/components/operator/BottomNav";

/**
 * Operator app shell. Mobile-first: a full-bleed cream app column that centers
 * (phone-width) on larger screens, with a fixed bottom tab bar. Content scrolls
 * beneath the bar (padding-bottom clears it).
 *
 * NOTE: no auth gate yet — operator login is a later milestone (simple gate).
 */
export default function OperatorLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="min-h-dvh bg-sand/40">
      <div className="relative mx-auto flex min-h-dvh max-w-md flex-col bg-cream shadow-sm">
        <main className="flex-1 pb-24">{children}</main>
        <BottomNav />
      </div>
    </div>
  );
}
