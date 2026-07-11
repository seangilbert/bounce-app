import Link from "next/link";
import { Confetti } from "@phosphor-icons/react/dist/ssr";
import { LEGAL } from "@/lib/legal/company";

/** Page chrome for a legal document: brand header, readable column, footer. */
export function LegalShell({
  title,
  updated,
  children,
}: {
  title: string;
  updated: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-dvh bg-cream text-ink">
      <header className="border-b border-sand">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-4">
          <Link href="/" className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand text-white">
              <Confetti size={18} weight="fill" />
            </span>
            <span className="font-display text-lg font-extrabold tracking-tight">{LEGAL.product}</span>
          </Link>
          <nav className="flex items-center gap-5 text-sm font-bold">
            <Link href="/terms" className="text-ink-mute hover:text-ink">
              Terms
            </Link>
            <Link href="/privacy" className="text-ink-mute hover:text-ink">
              Privacy
            </Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-12">
        <h1 className="font-display text-[34px] font-extrabold leading-tight tracking-tight text-balance">
          {title}
        </h1>
        <p className="mt-2 text-sm font-semibold text-ink-mute">Last updated: {updated}</p>

        <div className="mt-4 rounded-2xl border border-amber/40 bg-amber-tint/50 px-4 py-3 text-[13.5px] font-medium text-ink-soft">
          This is a general-purpose template, not legal advice. Have it reviewed by
          qualified counsel before relying on it.
        </div>

        <article className="mt-10">{children}</article>

        <footer className="mt-16 border-t border-sand pt-6 text-sm font-medium text-ink-mute">
          <p>
            Questions about this document? Contact us at{" "}
            <span className="font-bold text-ink-soft">{LEGAL.contactEmail}</span>.
          </p>
          <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1">
            <Link href="/terms" className="font-bold text-brand hover:text-brand-deep">
              Terms of Service
            </Link>
            <Link href="/privacy" className="font-bold text-brand hover:text-brand-deep">
              Privacy Policy
            </Link>
          </p>
        </footer>
      </main>
    </div>
  );
}

/* ── Typographic primitives (no typography plugin in this project) ─────────── */

export function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section className="mb-9 scroll-mt-24" id={id}>
      <h2 className="font-display text-[21px] font-extrabold tracking-tight text-ink">{title}</h2>
      <div className="mt-3 space-y-3">{children}</div>
    </section>
  );
}

export function P({ children }: { children: React.ReactNode }) {
  return <p className="text-[15.5px] leading-7 text-ink-soft">{children}</p>;
}

export function UL({ children }: { children: React.ReactNode }) {
  return <ul className="ml-1 space-y-2">{children}</ul>;
}

export function LI({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex gap-2.5 text-[15.5px] leading-7 text-ink-soft">
      <span className="mt-2.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-brand/60" aria-hidden />
      <span>{children}</span>
    </li>
  );
}

export function Strong({ children }: { children: React.ReactNode }) {
  return <strong className="font-bold text-ink">{children}</strong>;
}
