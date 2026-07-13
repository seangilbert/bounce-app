import Link from "next/link";
import { CalendarBlank, CaretRight, Package } from "@phosphor-icons/react/dist/ssr";
import { getSessionCustomer } from "@/lib/customers/session";
import { listAccountBookings, isUpcoming, type PortalBooking } from "@/lib/customers/portal";
import { CustomerSignOut } from "@/components/customer/CustomerSignOut";
import { NotARenter } from "@/components/customer/NotARenter";
import { StatusPill, fmtRange, money } from "@/components/customer/booking-ui";

export const dynamic = "force-dynamic";

export default async function MyBookingsPage() {
  const account = await getSessionCustomer();

  // Signed in (the middleware guaranteed that) but not a renter — i.e. an
  // operator user who wandered over. Render an explanation, NOT a redirect to
  // /my/login: they have a session, so that page would send them right back.
  if (!account) return <NotARenter />;

  const bookings = await listAccountBookings(account.id);
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = bookings.filter((b) => isUpcoming(b, today));
  const past = bookings.filter((b) => !isUpcoming(b, today));

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-extrabold tracking-tight text-ink">
            {account.name ? `Hi, ${account.name.split(" ")[0]}` : "My bookings"}
          </h1>
          <p className="mt-1 text-[15px] text-ink-soft">{account.email}</p>
        </div>
        <CustomerSignOut />
      </div>

      {bookings.length === 0 ? (
        <div className="mt-8 rounded-3xl border border-sand-line bg-white px-6 py-12 text-center">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-cream-2 text-ink-faint">
            <Package size={24} weight="fill" />
          </span>
          <p className="mt-4 font-display text-lg font-extrabold text-ink">No bookings yet</p>
          <p className="mx-auto mt-1.5 max-w-xs text-[15px] leading-relaxed text-ink-soft">
            When you book a rental, it&apos;ll show up here with your payments and contract.
          </p>
        </div>
      ) : (
        <>
          <Section title="Upcoming" bookings={upcoming} empty="Nothing coming up." />
          <Section title="Past" bookings={past} empty="No past bookings." />
        </>
      )}
    </div>
  );
}

function Section({
  title,
  bookings,
  empty,
}: {
  title: string;
  bookings: PortalBooking[];
  empty: string;
}) {
  return (
    <section className="mt-8">
      <h2 className="font-display text-sm font-extrabold uppercase tracking-wide text-ink-mute">
        {title}
      </h2>
      {bookings.length === 0 ? (
        <p className="mt-3 text-[15px] text-ink-faint">{empty}</p>
      ) : (
        <ul className="mt-3 space-y-3">
          {bookings.map((b) => (
            <li key={b.id}>
              <Link
                href={`/my/bookings/${b.id}`}
                className="flex items-center gap-4 rounded-3xl border border-sand-line bg-white px-5 py-4 transition hover:border-sand focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-ring"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-display font-extrabold text-ink">{b.operatorName}</span>
                    <StatusPill status={b.status} />
                  </div>
                  <p className="mt-1 flex items-center gap-1.5 text-sm text-ink-soft">
                    <CalendarBlank size={14} weight="fill" className="shrink-0 text-ink-faint" />
                    {fmtRange(b.startDate, b.endDate)}
                  </p>
                  <p className="mt-1 truncate text-sm text-ink-mute">
                    {b.items.map((i) => (i.quantity > 1 ? `${i.quantity}× ${i.name}` : i.name)).join(", ") ||
                      "—"}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="font-display font-extrabold text-ink">{money(b.total)}</p>
                  {b.balanceCents > 0 && (
                    <p className="mt-0.5 text-xs font-bold text-coral">
                      {money(b.balanceCents)} due
                    </p>
                  )}
                </div>
                <CaretRight size={16} weight="bold" className="shrink-0 text-ink-faint" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
