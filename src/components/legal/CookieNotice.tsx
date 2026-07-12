"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

const STORAGE_KEY = "bounce.cookie-notice.v1";

/**
 * Minimal cookie notice. The app sets only essential (auth) cookies, so this is
 * an informational notice, not a consent gate — dismissal is remembered in
 * localStorage. Rendered globally from the root layout; shows once until
 * acknowledged. If non-essential cookies are ever added, upgrade this to a
 * category-based consent manager and bump the storage key.
 */
export function CookieNotice() {
  // Start hidden and only reveal after mount, so the server/client markup match
  // and we never flash the banner to someone who already dismissed it.
  const [show, setShow] = useState(false);

  useEffect(() => {
    // Never show inside an embedded iframe (the operator's own site handles its
    // own cookie notice; our storefront only sets essential cookies there).
    if (typeof window !== "undefined" && window.self !== window.top) return;
    try {
      if (localStorage.getItem(STORAGE_KEY) !== "dismissed") setShow(true);
    } catch {
      // localStorage unavailable (private mode / SSR) — show the notice.
      setShow(true);
    }
  }, []);

  function dismiss() {
    try {
      localStorage.setItem(STORAGE_KEY, "dismissed");
    } catch {
      /* ignore */
    }
    setShow(false);
  }

  if (!show) return null;

  return (
    <div
      role="region"
      aria-label="Cookie notice"
      className="fixed inset-x-0 bottom-0 z-50 px-3 pb-3 sm:px-4 sm:pb-4"
    >
      <div className="mx-auto flex max-w-2xl flex-col gap-3 rounded-2xl border border-sand bg-cream px-4 py-3.5 shadow-lg sm:flex-row sm:items-center sm:justify-between">
        <p className="text-[13.5px] font-medium leading-6 text-ink-soft">
          We use essential cookies to keep you signed in and run the site. See our{" "}
          <Link href="/privacy" className="font-bold text-brand hover:text-brand-deep">
            Privacy Policy
          </Link>
          .
        </p>
        <button
          onClick={dismiss}
          className="flex-shrink-0 self-end rounded-full bg-brand px-5 py-2 text-sm font-bold text-white transition-colors hover:bg-brand-deep sm:self-auto"
        >
          Got it
        </button>
      </div>
    </div>
  );
}
