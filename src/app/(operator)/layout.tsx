import { BottomNav } from "@/components/operator/BottomNav";
import { Sidebar } from "@/components/operator/Sidebar";
import { getSessionOperator } from "@/lib/operator/session";
import { countNeedsReview } from "@/lib/inquiries/repo";

export const dynamic = "force-dynamic";

/**
 * Operator app shell — responsive.
 *  • Mobile: full-bleed cream column + fixed bottom tab bar.
 *  • Desktop (lg+): full-width layout — fixed-width sticky left rail + fluid
 *    main content that fills the rest of the screen.
 *
 * `min-w-0` on the main column lets it shrink to the viewport instead of being
 * forced wide by its content. No auth gate yet — that's a later milestone.
 */
export default async function OperatorLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const operator = await getSessionOperator();
  const needsCount = operator ? await countNeedsReview(operator.id) : 0;
  return (
    <div className="flex min-h-dvh w-full bg-cream">
      <Sidebar operator={operator} needsCount={needsCount} />
      <div className="flex min-h-dvh w-full min-w-0 flex-col overflow-x-hidden bg-cream lg:border-l lg:border-sand">
        <main className="flex flex-1 flex-col pb-20 lg:pb-0">{children}</main>
      </div>
      <BottomNav needsCount={needsCount} />
    </div>
  );
}
