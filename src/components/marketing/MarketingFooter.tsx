import Link from "next/link";
import { Wordmark } from "./Wordmark";

/** Public footer with product + legal links. Server component. */
export function MarketingFooter() {
  return (
    <footer className="border-t border-sand-line bg-cream-2">
      <div className="mx-auto max-w-6xl px-5 py-12 sm:px-8">
        <div className="flex flex-col gap-8 sm:flex-row sm:items-start sm:justify-between">
          <div className="max-w-xs">
            <Wordmark />
            <p className="mt-3 text-sm font-medium text-ink-mute">
              The all-in-one platform for party & equipment rental operators.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-8 sm:gap-14">
            <div>
              <div className="text-[13px] font-bold text-ink">Product</div>
              <ul className="mt-3 space-y-2 text-sm font-medium text-ink-mute">
                <li><Link href="/#features" className="hover:text-ink">Features</Link></li>
                <li><Link href="/pricing" className="hover:text-ink">Pricing</Link></li>
                <li><Link href="/signup?plan=free" className="hover:text-ink">Start free</Link></li>
                <li><Link href="/login" className="hover:text-ink">Log in</Link></li>
              </ul>
            </div>
            <div>
              <div className="text-[13px] font-bold text-ink">Legal</div>
              <ul className="mt-3 space-y-2 text-sm font-medium text-ink-mute">
                <li><Link href="/terms" className="hover:text-ink">Terms</Link></li>
                <li><Link href="/privacy" className="hover:text-ink">Privacy</Link></li>
              </ul>
            </div>
          </div>
        </div>
        <div className="mt-10 border-t border-sand-line pt-6 text-[13px] font-medium text-ink-faint">
          © {new Date().getFullYear()} Movables. All rights reserved.
        </div>
      </div>
    </footer>
  );
}
