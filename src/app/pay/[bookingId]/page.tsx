import { notFound } from "next/navigation";
import { Confetti, CheckCircle } from "@phosphor-icons/react/dist/ssr";
import { getBooking } from "@/lib/bookings/repo";
import { getOperatorById } from "@/lib/inventory/repo";
import { depositAmount } from "@/lib/deposit";
import { brandVars } from "@/lib/branding/palette";
import { PayButton } from "./PayButton";

export const dynamic = "force-dynamic";

const money = (c: number) => `$${(c / 100).toLocaleString("en-US")}`;
const RESERVING = ["paid", "contracted", "confirmed", "delivered", "completed"];
// Statuses where a remaining balance can be paid online. MUST stay in lockstep
// with the balance allowlist in /api/checkout (src/app/api/checkout/route.ts)
// or this page renders a button that 409s.
const BALANCE_PAYABLE = ["paid", "contracted", "confirmed", "delivered"];

function fmtRange(start: string, end: string): string {
  const f = (iso: string) =>
    new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      timeZone: "UTC",
    });
  return start === end ? f(start) : `${f(start)} → ${f(end)}`;
}

export async function generateMetadata({ params }: { params: { bookingId: string } }) {
  const booking = await getBooking(params.bookingId);
  const op = booking ? await getOperatorById(booking.operatorId) : null;
  return { title: op ? `Your quote — ${op.name}` : "Your quote" };
}

export default async function PayPage({
  params,
  searchParams,
}: {
  params: { bookingId: string };
  searchParams: { type?: string };
}) {
  const booking = await getBooking(params.bookingId);
  if (!booking) notFound();
  const operator = await getOperatorById(booking.operatorId);
  if (!operator) notFound();

  const requested =
    searchParams.type === "full" ? "full" : searchParams.type === "balance" ? "balance" : "deposit";
  // A balance charge only makes sense after payment; on a pre-payment booking
  // a ?type=balance link falls back to the normal deposit quote view.
  const paymentType = requested === "balance" ? "deposit" : requested;
  const dueNow = paymentType === "full" ? booking.total : depositAmount(booking.total, operator.depositPercent);
  const balance = booking.total - (booking.deposit ?? 0);

  const shell = (children: React.ReactNode) => (
    <div className="flex min-h-dvh flex-col items-center bg-cream px-5 py-10" style={brandVars(operator.brandColor)}>
      <div className="flex items-center gap-2.5">
        <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-brand text-white">
          <Confetti size={20} weight="fill" />
        </span>
        <span className="font-display text-lg font-extrabold tracking-tight text-ink">{operator.name}</span>
      </div>
      <div className="mt-6 w-full max-w-md rounded-[24px] border border-sand-line bg-white p-6 shadow-sm">
        {children}
      </div>
    </div>
  );

  if (booking.status === "canceled") {
    return shell(
      <p className="text-center text-sm font-medium text-ink-mute">
        This quote is no longer available. Please reach out to {operator.name} for a new one.
      </p>,
    );
  }

  if (RESERVING.includes(booking.status)) {
    // Paid booking with a remaining balance: the customer-facing balance
    // payment (linked from the renter portal and the balance-reminder email).
    if (requested === "balance" && BALANCE_PAYABLE.includes(booking.status) && balance > 0) {
      return shell(
        <>
          <h1 className="font-display text-2xl font-bold tracking-tight text-ink">Pay your balance</h1>
          <div className="mt-1 text-sm font-bold text-brand">{fmtRange(booking.startDate, booking.endDate)}</div>
          <div className="mt-4 space-y-1 border-t border-sand-line pt-4 text-sm">
            <div className="flex justify-between text-ink-mute">
              <span>Total</span>
              <span className="font-semibold text-ink">{money(booking.total)}</span>
            </div>
            <div className="flex justify-between text-ink-mute">
              <span>Paid so far</span>
              <span className="font-semibold text-ink">{money(booking.deposit ?? 0)}</span>
            </div>
            <div className="flex justify-between pt-0.5">
              <span className="font-bold text-ink">Balance due</span>
              <span className="font-display text-lg font-extrabold text-ink">{money(balance)}</span>
            </div>
          </div>
          <PayButton bookingId={booking.id} paymentType="balance" dueLabel={money(balance)} />
          <p className="mt-2 text-center text-xs font-medium text-ink-mute">
            Secure checkout — you&apos;ll get a receipt by email.
          </p>
        </>,
      );
    }
    return shell(
      <div className="flex flex-col items-center gap-2 text-center">
        <CheckCircle size={40} weight="fill" className="text-teal" />
        <h1 className="font-display text-xl font-bold text-ink">You&apos;re all set</h1>
        <p className="text-sm font-medium text-ink-mute">
          This booking is already confirmed for {fmtRange(booking.startDate, booking.endDate)}.
        </p>
      </div>,
    );
  }

  return shell(
    <>
      <h1 className="font-display text-2xl font-bold tracking-tight text-ink">Your custom quote</h1>
      <div className="mt-1 text-sm font-bold text-brand">{fmtRange(booking.startDate, booking.endDate)}</div>

      <div className="mt-4 flex flex-col gap-2 border-t border-sand-line pt-4">
        {booking.items.map((li) => (
          <div key={li.itemId} className="flex items-center justify-between text-sm">
            <span className="font-semibold text-ink">
              {li.quantity > 1 ? `${li.quantity}× ` : ""}
              {li.name}
            </span>
            <span className="font-bold text-ink">{money(li.lineTotal)}</span>
          </div>
        ))}
        <div className="mt-2 space-y-1 border-t border-sand-line pt-2.5 text-sm">
          {booking.deliveryFee > 0 || booking.taxAmount > 0 || booking.discount > 0 ? (
            <div className="flex justify-between text-ink-mute">
              <span>Subtotal</span>
              <span className="font-semibold text-ink">{money(booking.subtotal)}</span>
            </div>
          ) : null}
          {booking.discount > 0 ? (
            <div className="flex justify-between font-semibold text-teal">
              <span>Discount{booking.promoCode ? ` · ${booking.promoCode}` : ""}</span>
              <span>− {money(booking.discount)}</span>
            </div>
          ) : null}
          {booking.deliveryFee > 0 ? (
            <div className="flex justify-between text-ink-mute">
              <span>Delivery</span>
              <span className="font-semibold text-ink">{money(booking.deliveryFee)}</span>
            </div>
          ) : null}
          {booking.taxAmount > 0 ? (
            <div className="flex justify-between text-ink-mute">
              <span>Sales tax</span>
              <span className="font-semibold text-ink">{money(booking.taxAmount)}</span>
            </div>
          ) : null}
          <div className="flex justify-between pt-0.5">
            <span className="font-bold text-ink">Total</span>
            <span className="font-display text-lg font-extrabold text-ink">{money(booking.total)}</span>
          </div>
        </div>
      </div>

      <PayButton bookingId={booking.id} paymentType={paymentType} dueLabel={money(dueNow)} />
      <p className="mt-2 text-center text-xs font-medium text-ink-mute">
        {paymentType === "full" ? "Pay in full to reserve." : "Pay the deposit to reserve — balance due on delivery."}{" "}
        Delivery, setup &amp; pickup included.
      </p>
    </>,
  );
}
