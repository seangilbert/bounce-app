import { BottomNav } from "@/components/operator/BottomNav";
import { Sidebar } from "@/components/operator/Sidebar";

/**
 * Operator app shell — responsive.
 *  • Mobile: full-bleed cream column + fixed bottom tab bar.
 *  • Desktop (lg+): full-width layout — fixed-width sticky left rail + fluid
 *    main content that fills the rest of the screen.
 *
 * `min-w-0` on the main column lets it shrink to the viewport instead of being
 * forced wide by its content. No auth gate yet — that's a later milestone.
 */
export default function OperatorLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="flex min-h-dvh w-full bg-cream">
      <Sidebar />
      <div className="flex min-h-dvh w-full min-w-0 flex-col overflow-x-hidden bg-cream lg:border-l lg:border-sand">
        <main className="flex-1 pb-24 lg:pb-10">{children}</main>
      </div>
      <BottomNav />
    </div>
  );
}
