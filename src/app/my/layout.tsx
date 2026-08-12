import Link from "next/link";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "My bookings — Movables",
  description: "See your party rental bookings, payments, and contracts.",
};

/**
 * Renter portal shell. Deliberately platform-branded (Movables), not
 * operator-branded: this list spans every operator the person has rented from,
 * so wearing one operator's colors here would be a lie. Individual bookings
 * name their operator.
 */
export default function PortalLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="flex min-h-dvh flex-col bg-cream">
      <header className="border-b border-sand-line bg-cream/80 backdrop-blur">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between px-5 py-4">
          <Link href="/my" className="inline-flex items-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/movables-logo.png" alt="Movables" className="h-7 w-auto" />
          </Link>
          <span className="text-sm font-semibold text-ink-mute">My bookings</span>
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-5 py-8">{children}</main>
    </div>
  );
}
