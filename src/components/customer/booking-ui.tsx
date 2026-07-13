export const money = (cents: number) => `$${(cents / 100).toLocaleString("en-US")}`;

export function fmtRange(start: string, end: string): string {
  const f = (iso: string) =>
    new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    });
  return start === end ? f(start) : `${f(start)} → ${f(end)}`;
}

/**
 * Booking status, in the renter's language.
 *
 * The internal machine has nine states (see lib/bookings/types.ts) that encode
 * things the renter neither knows nor cares about — `contracted` vs `confirmed`
 * is about whether SignWell has called back yet. Collapse them into the three
 * facts a customer actually wants: is it locked in, is it done, is it off.
 */
const LABELS: Record<string, { label: string; tone: "brand" | "teal" | "amber" | "mute" }> = {
  quoted: { label: "Quote", tone: "amber" },
  pending_payment: { label: "Awaiting payment", tone: "amber" },
  inquiry: { label: "Enquiry", tone: "mute" },
  paid: { label: "Confirmed", tone: "brand" },
  contracted: { label: "Confirmed", tone: "brand" },
  confirmed: { label: "Confirmed", tone: "brand" },
  delivered: { label: "Delivered", tone: "teal" },
  completed: { label: "Completed", tone: "teal" },
  canceled: { label: "Canceled", tone: "mute" },
};

const TONES = {
  brand: "bg-brand-tint text-brand-deep",
  teal: "bg-teal-tint text-teal-deep",
  amber: "bg-amber-tint text-amber-deep",
  mute: "bg-cream-2 text-ink-mute",
} as const;

export function StatusPill({ status }: { status: string }) {
  const s = LABELS[status] ?? { label: status, tone: "mute" as const };
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide ${TONES[s.tone]}`}
    >
      {s.label}
    </span>
  );
}

/** Payment rows read from `orders` — see lib/customers/portal.ts. */
const PAYMENT_LABELS: Record<string, string> = {
  deposit: "Deposit",
  balance: "Balance",
  full: "Paid in full",
  payment: "Payment",
};

export function paymentLabel(type: string, method?: string): string {
  const base = PAYMENT_LABELS[type] ?? "Payment";
  return method === "cash" ? `${base} (cash)` : base;
}
