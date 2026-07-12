import Link from "next/link";
import { Wordmark } from "./Wordmark";

/** Sticky public header for the marketing pages. Server component — no client JS. */
export function MarketingHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-sand-line/80 bg-cream/85 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5 sm:px-8">
        <Wordmark />
        <nav className="flex items-center gap-1 sm:gap-2">
          <Link
            href="/#features"
            className="hidden rounded-full px-3.5 py-2 text-sm font-bold text-ink-soft hover:text-ink sm:block"
          >
            Features
          </Link>
          <Link
            href="/pricing"
            className="hidden rounded-full px-3.5 py-2 text-sm font-bold text-ink-soft hover:text-ink sm:block"
          >
            Pricing
          </Link>
          <Link
            href="/login"
            className="rounded-full px-3.5 py-2 text-sm font-bold text-ink-soft hover:text-ink"
          >
            Log in
          </Link>
          <Link
            href="/signup?plan=free"
            className="rounded-full bg-brand px-4 py-2 text-sm font-bold text-white hover:bg-brand-deep"
          >
            Start free
          </Link>
        </nav>
      </div>
    </header>
  );
}
