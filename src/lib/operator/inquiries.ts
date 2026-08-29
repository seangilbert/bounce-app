export type InquiryStatus = "needs_review" | "escalated" | "auto" | "replied";

/** Handoff state (inbox-plan Phase 0): who answers this thread right now. */
export type InquiryOwner = "ai" | "needs_human" | "human";

/** Did this inquiry turn into a booking? Shown in the inbox so operators (esp.
 *  on auto-answered inquiries) can see the outcome and decide whether to follow up. */
export type BookingOutcomeStatus = "booked" | "pending" | "quoted" | "canceled" | "none";
export interface BookingOutcome {
  status: BookingOutcomeStatus;
  bookingId?: string;
  amount?: string;
  dateLabel?: string;
}

export interface InquiryListItem {
  id: string;
  name: string;
  initials: string;
  time: string;
  status: InquiryStatus;
  owner: InquiryOwner;
  preview: string;
  customerType: string;
  location: string;
  outcome: BookingOutcome;
}

export interface AiDraft {
  match: { name: string; availabilityLabel: string; price: string; unit: string };
  message: string;
  replyDraft: string;
}

/** A quote pre-formatted for an expandable card — the AI's auto-quote well or
 *  a quote message an operator sent from the builder. */
export interface QuoteSummary {
  lines: { name: string; quantity: number; lineTotal: string }[];
  subtotal: string;
  /** null = delivery deferred to checkout (zones/distance pricing). */
  deliveryFee: string | null;
  tax: string | null;
  /** Promo discount, when one was applied (operator-sent quotes). */
  discount?: string | null;
  total: string;
  deposit: string;
  eventDateLabel: string;
  /** The personal message included with an operator-sent quote. */
  note?: string | null;
  /** The pay link the customer received (operator-sent quotes). */
  payUrl?: string | null;
  /** Whether the pay link asked for the deposit or the full amount. */
  paymentType?: "deposit" | "full";
}

/** The raw `inquiry_messages.metadata` payload for a sent quote (cents).
 *  A `type` (not interface) so it assigns to Record<string, unknown>. */
export type QuoteMessageMeta = {
  kind: "quote";
  lines: { name: string; quantity: number; lineTotal: number }[];
  subtotal: number;
  deliveryFee: number | null;
  tax: number | null;
  discount?: number | null;
  total: number;
  deposit: number;
  startDate: string;
  endDate: string;
  note?: string | null;
  payUrl?: string | null;
  paymentType?: "deposit" | "full";
};

function fmtCents(cents: number): string {
  return (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
  });
}

/** Message metadata → the card shape, or undefined when it isn't a quote.
 *  Defensive on shape: metadata is free-form jsonb from the DB. */
export function quoteFromMessageMeta(meta: unknown): QuoteSummary | undefined {
  if (!meta || typeof meta !== "object") return undefined;
  const m = meta as Partial<QuoteMessageMeta>;
  if (m.kind !== "quote" || !Array.isArray(m.lines) || typeof m.total !== "number") return undefined;
  return {
    lines: m.lines.map((l) => ({
      name: String(l.name ?? ""),
      quantity: Number(l.quantity) || 1,
      lineTotal: fmtCents(Number(l.lineTotal) || 0),
    })),
    subtotal: fmtCents(typeof m.subtotal === "number" ? m.subtotal : m.total),
    deliveryFee: typeof m.deliveryFee === "number" ? fmtCents(m.deliveryFee) : null,
    tax: typeof m.tax === "number" ? fmtCents(m.tax) : null,
    discount: typeof m.discount === "number" && m.discount > 0 ? fmtCents(m.discount) : null,
    total: fmtCents(m.total),
    deposit: fmtCents(typeof m.deposit === "number" ? m.deposit : 0),
    eventDateLabel: m.startDate
      ? new Date(`${m.startDate}T00:00:00Z`).toLocaleDateString("en-US", {
          weekday: "short",
          month: "short",
          day: "numeric",
          timeZone: "UTC",
        })
      : "",
    note: m.note ?? null,
    payUrl: m.payUrl ?? null,
    paymentType: m.paymentType === "full" ? "full" : "deposit",
  };
}

export interface ThreadMsg {
  id: string;
  sender: "customer" | "operator" | "ai";
  body: string;
  time: string;
  /** Per-message channel ('website' | 'sms' | 'email'); null on legacy rows. */
  channel: string | null;
  direction: "inbound" | "outbound" | null;
  /** Set when this message carries a quote — rendered as a quote card. */
  quote?: QuoteSummary;
}

export interface InquiryDetail {
  whyBanner?: string;
  /** Whether this inquiry converted to a booking. */
  outcome: BookingOutcome;
  /** Handoff state — drives the AI-paused chip + Take over / Hand back. */
  owner: InquiryOwner;
  /** Customer email, for the reply/contact action (null if not captured). */
  email: string | null;
  /** Customer phone, for texting (null if not captured). */
  phone: string | null;
  /** How the customer is currently reached ("sms" once a text thread starts). */
  channel: string;
  /** Seed for the operator's "Create quote" builder (items/dates/customer). */
  prefill: {
    items: { itemId: string; quantity: number }[];
    startDate: string;
    endDate: string;
    customerName: string | null;
    customerEmail: string | null;
  };
  /** Where the inquiry came in, e.g. "via your website". */
  channelMeta: string;
  /** Full conversation, oldest first (customer + operator + AI auto-answers). */
  thread: ThreadMsg[];
  /** AI-suggested reply for a needs_review inquiry — pre-fills the composer. */
  aiDraft?: AiDraft;
  /** The latest AI-computed quote — the expandable well under the thread. */
  quote?: QuoteSummary;
}
