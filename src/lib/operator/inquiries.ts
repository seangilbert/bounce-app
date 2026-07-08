export type InquiryStatus = "needs_review" | "escalated" | "auto" | "replied";

/** Did this inquiry turn into a booking? Shown in the inbox so operators (esp.
 *  on auto-answered inquiries) can see the outcome and decide whether to follow up. */
export type BookingOutcomeStatus = "booked" | "pending" | "canceled" | "none";
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

export interface ThreadMsg {
  id: string;
  sender: "customer" | "operator" | "ai";
  body: string;
  time: string;
}

export interface InquiryDetail {
  whyBanner?: string;
  /** Whether this inquiry converted to a booking. */
  outcome: BookingOutcome;
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
}
