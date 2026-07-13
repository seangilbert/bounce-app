import Link from "next/link";
import { Warning } from "@phosphor-icons/react/dist/ssr";
import { CustomerSignOut } from "./CustomerSignOut";

/**
 * Shown when someone reaches /my with a valid session but no renter account —
 * in practice an operator user.
 *
 * This is an explanation rather than a redirect on purpose. Sending them to
 * /my/login would bounce them straight back here (they ARE signed in), and
 * sending them to /dashboard would be wrong if they got here on purpose. So we
 * name the situation and offer both exits.
 */
export function NotARenter() {
  return (
    <div className="mx-auto max-w-md rounded-3xl border border-sand-line bg-white px-6 py-10 text-center">
      <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-tint text-amber-deep">
        <Warning size={24} weight="fill" />
      </span>
      <h1 className="mt-4 font-display text-xl font-extrabold tracking-tight text-ink">
        You&apos;re signed in to an operator account
      </h1>
      <p className="mx-auto mt-2 max-w-sm text-[15px] leading-relaxed text-ink-soft">
        This page shows bookings you&apos;ve made as a customer. To see it, sign out and sign back in
        with the email you booked with.
      </p>
      <div className="mt-6 flex items-center justify-center gap-3">
        <Link
          href="/dashboard"
          className="rounded-2xl bg-brand px-4 py-2.5 text-sm font-bold text-white transition hover:bg-brand-deep"
        >
          Go to dashboard
        </Link>
        <CustomerSignOut />
      </div>
    </div>
  );
}
