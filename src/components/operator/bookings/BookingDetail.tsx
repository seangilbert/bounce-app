"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  CaretLeft,
  User,
  MapPin,
  CalendarBlank,
  CheckCircle,
  Truck,
  CircleNotch,
  Receipt,
  Signature,
} from "@phosphor-icons/react/dist/ssr";
import type { Booking, BookingStatus } from "@/lib/bookings/types";
import {
  markDeliveredAction,
  markCompletedAction,
  cancelBookingAction,
  refundBookingAction,
  type ActionResult,
} from "@/app/(operator)/bookings/actions";

const money = (c: number) => `$${(c / 100).toLocaleString("en-US")}`;

function fmtRange(start: string, end: string): string {
  const f = (iso: string) =>
    new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    });
  return start === end ? f(start) : `${f(start)} → ${f(end)}`;
}

const STATUS_META: Record<BookingStatus, { label: string; cls: string }> = {
  inquiry: { label: "Inquiry", cls: "bg-sand text-ink-soft" },
  quoted: { label: "Quoted", cls: "bg-sand text-ink-soft" },
  pending_payment: { label: "Payment pending", cls: "bg-amber-tint text-amber-deep" },
  paid: { label: "Paid", cls: "bg-brand-tint text-brand-deep" },
  contracted: { label: "Contracted", cls: "bg-brand-tint text-brand-deep" },
  confirmed: { label: "Confirmed", cls: "bg-teal-tint text-teal-deep" },
  delivered: { label: "Delivered", cls: "bg-teal-tint text-teal-deep" },
  completed: { label: "Completed", cls: "bg-teal-tint text-teal-deep" },
  canceled: { label: "Canceled", cls: "bg-coral-tint text-coral-deep" },
};

export function BookingDetail({
  booking,
  payment,
}: {
  booking: Booking;
  payment: { status: string; amountTotal: number; esignStatus: string | null } | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState<"cancel" | "refund" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(action: () => Promise<ActionResult>) {
    setBusy(true);
    setError(null);
    const res = await action();
    if (res.ok) {
      setConfirming(null);
      router.refresh();
      setBusy(false);
    } else {
      setError(res.error);
      setBusy(false);
    }
  }

  const s = booking.status;
  const canDeliver = s === "paid" || s === "contracted" || s === "confirmed";
  const canComplete = s === "delivered";
  const canCancel = !["completed", "canceled"].includes(s);
  const canRefund = payment?.status === "paid";
  const paid = booking.deposit ?? 0;
  const balance = booking.subtotal - paid;
  const meta = STATUS_META[s];

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-5 px-5 py-6 lg:px-8">
      <div className="flex items-center justify-between">
        <Link href="/calendar" className="flex items-center gap-1.5 text-sm font-bold text-ink-soft hover:text-ink">
          <CaretLeft size={18} weight="bold" /> Calendar
        </Link>
        <span className={`rounded-full px-3 py-1 text-[12px] font-extrabold ${meta.cls}`}>{meta.label}</span>
      </div>

      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight text-ink lg:text-3xl">
          {booking.customerName ?? "Customer"}
        </h1>
        <p className="mt-0.5 text-sm font-medium text-ink-mute">
          Booking #{booking.id.slice(0, 8).toUpperCase()} · {fmtRange(booking.startDate, booking.endDate)}
        </p>
      </div>

      {/* Items */}
      <Card>
        {booking.items.map((li) => (
          <div key={li.itemId} className="flex items-center justify-between py-1 text-sm">
            <span className="font-semibold text-ink">
              {li.quantity > 1 ? `${li.quantity}× ` : ""}
              {li.name}
            </span>
            <span className="font-bold text-ink">{money(li.lineTotal)}</span>
          </div>
        ))}
        <div className="mt-2 space-y-1 border-t border-sand-line pt-2.5 text-sm">
          <Row label="Total" value={money(booking.subtotal)} bold />
          {paid > 0 ? <Row label="Paid" value={`− ${money(paid)}`} /> : null}
          {balance > 0 ? <Row label="Balance due on delivery" value={money(balance)} accent /> : null}
        </div>
      </Card>

      {/* Customer + delivery */}
      <Card>
        <InfoLine icon={<User size={17} weight="fill" />} value={booking.customerEmail ?? "No email"} />
        <InfoLine
          icon={<MapPin size={17} weight="fill" />}
          value={booking.deliveryAddress ?? "No delivery address"}
        />
        <InfoLine
          icon={<CalendarBlank size={17} weight="fill" />}
          value={`${fmtRange(booking.startDate, booking.endDate)}${booking.deliveryWindow ? ` · ${booking.deliveryWindow}` : ""}`}
        />
      </Card>

      {/* Payment + contract */}
      {payment ? (
        <Card>
          <InfoLine
            icon={<Receipt size={17} weight="fill" />}
            value={
              payment.status === "refunded"
                ? `Refunded (${money(payment.amountTotal)})`
                : payment.status === "paid"
                  ? `${money(payment.amountTotal)} collected`
                  : `Payment ${payment.status}`
            }
          />
          {payment.esignStatus ? (
            <InfoLine
              icon={<Signature size={17} weight="fill" />}
              value={`Agreement: ${payment.esignStatus}`}
            />
          ) : null}
        </Card>
      ) : null}

      {error ? (
        <div className="rounded-xl bg-coral-tint px-4 py-3 text-sm font-semibold text-coral-deep">{error}</div>
      ) : null}

      {/* Actions */}
      <div className="flex flex-col gap-2.5">
        {canDeliver ? (
          <ActionButton onClick={() => run(() => markDeliveredAction(booking.id))} busy={busy} icon={<Truck size={16} weight="fill" />}>
            Mark delivered
          </ActionButton>
        ) : null}
        {canComplete ? (
          <ActionButton onClick={() => run(() => markCompletedAction(booking.id))} busy={busy} icon={<CheckCircle size={16} weight="fill" />}>
            Mark completed
          </ActionButton>
        ) : null}

        {confirming === "cancel" ? (
          <ConfirmBar
            label="Cancel this booking? It frees the reserved inventory."
            confirmLabel="Yes, cancel"
            busy={busy}
            onConfirm={() => run(() => cancelBookingAction(booking.id))}
            onDeny={() => setConfirming(null)}
          />
        ) : confirming === "refund" ? (
          <ConfirmBar
            label={`Refund ${payment ? money(payment.amountTotal) : "the payment"} and cancel? This can't be undone.`}
            confirmLabel="Refund & cancel"
            busy={busy}
            danger
            onConfirm={() => run(() => refundBookingAction(booking.id))}
            onDeny={() => setConfirming(null)}
          />
        ) : (
          <div className="flex gap-2.5">
            {canRefund ? (
              <button
                onClick={() => setConfirming("refund")}
                disabled={busy}
                className="flex-1 rounded-full border border-coral-line bg-white px-5 py-3 text-sm font-bold text-coral-deep transition-colors hover:bg-coral-tint disabled:opacity-50"
              >
                Refund
              </button>
            ) : null}
            {canCancel ? (
              <button
                onClick={() => setConfirming("cancel")}
                disabled={busy}
                className="flex-1 rounded-full border border-sand bg-white px-5 py-3 text-sm font-bold text-ink-soft transition-colors hover:bg-sand disabled:opacity-50"
              >
                Cancel booking
              </button>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return <div className="rounded-2xl border border-sand-line bg-white p-4">{children}</div>;
}

function Row({ label, value, bold, accent }: { label: string; value: string; bold?: boolean; accent?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className={`${bold ? "font-bold text-ink" : "font-medium text-ink-mute"}`}>{label}</span>
      <span className={`${accent ? "font-bold text-amber-deep" : bold ? "font-display text-lg font-extrabold text-ink" : "font-semibold text-ink"}`}>
        {value}
      </span>
    </div>
  );
}

function InfoLine({ icon, value }: { icon: React.ReactNode; value: string }) {
  return (
    <div className="flex items-center gap-2.5 py-1.5 text-sm">
      <span className="flex-shrink-0 text-ink-mute">{icon}</span>
      <span className="font-medium text-ink">{value}</span>
    </div>
  );
}

function ActionButton({
  onClick,
  busy,
  icon,
  children,
}: {
  onClick: () => void;
  busy: boolean;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={busy}
      className="flex items-center justify-center gap-2 rounded-full bg-brand px-5 py-3.5 text-sm font-bold text-white transition-colors hover:bg-brand-deep disabled:cursor-not-allowed disabled:bg-sand disabled:text-ink-mute"
    >
      {busy ? <CircleNotch size={16} weight="bold" className="animate-spin" /> : icon} {children}
    </button>
  );
}

function ConfirmBar({
  label,
  confirmLabel,
  busy,
  danger,
  onConfirm,
  onDeny,
}: {
  label: string;
  confirmLabel: string;
  busy: boolean;
  danger?: boolean;
  onConfirm: () => void;
  onDeny: () => void;
}) {
  return (
    <div className="rounded-2xl border border-sand-line bg-white p-4">
      <p className="text-sm font-semibold text-ink">{label}</p>
      <div className="mt-3 flex gap-2.5">
        <button
          onClick={onConfirm}
          disabled={busy}
          className={`flex flex-1 items-center justify-center gap-2 rounded-full px-5 py-2.5 text-sm font-bold text-white transition-colors disabled:opacity-60 ${
            danger ? "bg-coral hover:bg-coral-deep" : "bg-ink hover:bg-ink-soft"
          }`}
        >
          {busy ? <CircleNotch size={16} weight="bold" className="animate-spin" /> : null} {confirmLabel}
        </button>
        <button
          onClick={onDeny}
          disabled={busy}
          className="rounded-full border border-sand bg-white px-5 py-2.5 text-sm font-bold text-ink-soft hover:bg-sand"
        >
          Keep
        </button>
      </div>
    </div>
  );
}
