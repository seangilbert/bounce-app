import { redirect } from "next/navigation";
import { BottomNav } from "@/components/operator/BottomNav";
import { Sidebar } from "@/components/operator/Sidebar";
import { getSessionMembership, getSessionOperatorOptions, userDisplayName } from "@/lib/operator/session";
import { getSessionCustomer } from "@/lib/customers/session";
import { countNeedsReview } from "@/lib/inquiries/repo";
import { brandVars } from "@/lib/branding/palette";

export const dynamic = "force-dynamic";

/**
 * Operator app shell — responsive.
 *  • Mobile: full-bleed cream column that scrolls (body) + fixed bottom tab bar.
 *  • Desktop (lg+): the shell is locked to the viewport height (`h-dvh` +
 *    `overflow-hidden`) so the left rail stays put and ONLY the main content
 *    column scrolls (`overflow-y-auto`). Relying on `position: sticky` here
 *    doesn't work — `overflow-x: hidden` on <body> breaks it.
 *
 * `min-w-0` on the main column lets it shrink to the viewport instead of being
 * forced wide by its content.
 */
export default async function OperatorLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const membership = await getSessionMembership();

  // A signed-in user with no operator membership reached the operator app. The
  // likeliest cause is now a RENTER: the middleware sends any authenticated
  // visitor from /login to /dashboard, and it can't tell the two principals
  // apart at the edge (see the note there). Send them to their own portal
  // rather than showing them an empty operator shell.
  //
  // Users with neither membership nor a customer account fall through to the
  // existing "No operator linked to your account." empty state — that's an
  // orphaned operator login, a genuinely different problem.
  if (!membership && (await getSessionCustomer())) redirect("/my");

  const operator = membership?.operator ?? null;
  const role = membership?.role ?? "employee";
  const userDisplay = membership ? userDisplayName(membership) : "Account";
  const operatorOptions = await getSessionOperatorOptions();
  const needsCount = operator ? await countNeedsReview(operator.id) : 0;
  return (
    <div
      className="flex min-h-dvh w-full bg-cream lg:h-dvh lg:overflow-hidden"
      style={brandVars(operator?.brandColor)}
    >
      <Sidebar
        operator={operator}
        role={role}
        userDisplay={userDisplay}
        needsCount={needsCount}
        operatorOptions={operatorOptions}
      />
      <div className="flex min-h-dvh w-full min-w-0 flex-col overflow-x-hidden bg-cream lg:h-dvh lg:min-h-0 lg:overflow-y-auto">
        <main className="flex flex-1 flex-col pb-20 lg:pb-0">{children}</main>
      </div>
      <BottomNav needsCount={needsCount} />
    </div>
  );
}
