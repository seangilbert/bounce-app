import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  CalendarBlank,
  CheckCircle,
  MapPin,
  Phone,
  Receipt,
  Signature,
  ArrowClockwise,
} from "@phosphor-icons/react/dist/ssr";
import { getSessionCustomer } from "@/lib/customers/session";
import { getAccountBooking } from "@/lib/customers/portal";
import { NotARenter } from "@/components/customer/NotARenter";
import { StatusPill, fmtRange, money, paymentLabel } from "@/components/customer/booking-ui";

export const dynamic = "force-dynamic";

export default async function MyBookingPage({ params }: { params: { id: string } }) {
  const account = await getSessionCustomer();
  if (!account) return <NotARenter />;

  // Scoped by account — an id belonging to someone else returns null, and we
  // 404 it rather than saying "not yours", which would confirm it exists.
  const booking = await getAccountBooking(account.id, params.id);
  if (!booking) notFound();

  const signed = booking.contractStatus === "completed" || booking.contractStatus === "signed";

  return (
    <div>
      <Link
        href="/my"
        className="mb-5 inline-flex items-center gap-1.5 text-sm font-semibold text-ink-mute transition hover:text-ink"
      >
        <ArrowLeft size={15} weight="bold" />
        All bookings
      </Link>

      <div className="flex flex-wrap items-center gap-2.5">
        <h1 className="font-display text-2xl font-extrabold tracking-tight text-ink">
          {booking.operatorName}
        </h1>
        <StatusPill status={booking.status} />
      </div>

      <div className="mt-4 space-y-2 text-[15px] text-ink-soft">
        <p className="flex items-center gap-2">
          <CalendarBlank size={16} weight="fill" className="shrink-0 text-ink-faint" />
          {fmtRange(booking.startDate, booking.endDate)}
          {booking.deliveryWindow && (
            <span className="text-ink-mute">· {booking.deliveryWindow}</span>
          )}
        </p>
        {booking.deliveryAddress && (
          <p className="flex items-center gap-2">
            <MapPin size={16} weight="fill" className="shrink-0 text-ink-faint" />
            {booking.deliveryAddress}
          </p>
        )}
        {booking.operatorPhone && (
          <p className="flex items-center gap-2">
            <Phone size={16} weight="fill" className="shrink-0 text-ink-faint" />
            <a href={`tel:${booking.operatorPhone}`} className="font-semibold text-brand-deep hover:underline">
              {booking.operatorPhone}
            </a>
          </p>
        )}
      </div>

      {booking.balanceCents > 0 && (
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-coral-line bg-coral-tint px-5 py-4">
          <div>
            <p className="font-display font-extrabold text-ink">
              {money(booking.balanceCents)} balance due
            </p>
            <p className="mt-0.5 text-sm text-ink-soft">Pay the rest before your event.</p>
          </div>
          {/* Reuses the existing public pay page — the same one the operator's
              "send payment link" email points at. No new payment surface. */}
          <Link
            href={`/pay/${booking.id}?type=balance`}
            className="rounded-2xl bg-brand px-4 py-2.5 text-sm font-bold text-white transition hover:bg-brand-deep"
          >
            Pay balance
          </Link>
        </div>
      )}

      <Card title="What you booked" icon={<Receipt size={16} weight="fill" />}>
        <ul className="space-y-2.5">
          {booking.items.map((item, i) => (
            <li key={i} className="flex items-baseline justify-between gap-4 text-[15px]">
              <span className="text-ink">
                {item.quantity > 1 && <span className="text-ink-mute">{item.quantity}× </span>}
                {item.name}
              </span>
            </li>
          ))}
          {booking.items.length === 0 && <li className="text-[15px] text-ink-faint">—</li>}
        </ul>
        <div className="mt-4 flex items-baseline justify-between border-t border-sand-line pt-3">
          <span className="text-[15px] font-semibold text-ink">Total</span>
          <span className="font-display text-lg font-extrabold text-ink">{money(booking.total)}</span>
        </div>
      </Card>

      {booking.payments.length > 0 && (
        <Card title="Payments" icon={<CheckCircle size={16} weight="fill" />}>
          <ul className="space-y-3">
            {booking.payments.map((p, i) => (
              <li key={i} className="flex items-center justify-between gap-4 text-[15px]">
                <div>
                  <p className="text-ink">{paymentLabel(p.type, p.method)}</p>
                  <p className="text-sm text-ink-mute">
                    {new Date(p.date).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </p>
                </div>
                <span
                  className={
                    p.status === "refunded"
                      ? "font-display font-extrabold text-ink-mute line-through"
                      : p.status === "paid"
                        ? "font-display font-extrabold text-ink"
                        : "font-display font-extrabold text-ink-faint"
                  }
                >
                  {money(p.amountCents)}
                </span>
              </li>
            ))}
          </ul>
          <div className="mt-4 flex items-baseline justify-between border-t border-sand-line pt-3">
            <span className="text-[15px] font-semibold text-ink">Paid to date</span>
            <span className="font-display text-lg font-extrabold text-ink">
              {money(booking.paidCents)}
            </span>
          </div>
        </Card>
      )}

      {booking.contractStatus && (
        <Card title="Rental agreement" icon={<Signature size={16} weight="fill" />}>
          <p className="text-[15px] leading-relaxed text-ink-soft">
            {signed
              ? "Signed — you're all set. A copy was emailed to you when you signed."
              : "Sent to your email for signature. Check your inbox to sign it before your event."}
          </p>
        </Card>
      )}

      {booking.operatorSlug && (
        <Link
          href={`/s/${booking.operatorSlug}`}
          className="mt-6 flex items-center justify-center gap-2 rounded-2xl border border-sand bg-white px-4 py-3 text-[15px] font-bold text-ink transition hover:border-ink-faint focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-ring"
        >
          <ArrowClockwise size={17} weight="bold" />
          Book {booking.operatorName} again
        </Link>
      )}
    </div>
  );
}

function Card({
  title,
  icon,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-6 rounded-3xl border border-sand-line bg-white px-5 py-5">
      <h2 className="mb-4 flex items-center gap-2 font-display text-sm font-extrabold uppercase tracking-wide text-ink-mute">
        <span className="text-ink-faint">{icon}</span>
        {title}
      </h2>
      {children}
    </section>
  );
}
