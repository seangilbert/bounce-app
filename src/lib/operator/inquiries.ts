export type InquiryStatus = "needs_review" | "escalated" | "auto" | "replied";

export interface InquiryListItem {
  id: string;
  name: string;
  initials: string;
  time: string;
  status: InquiryStatus;
  preview: string;
  customerType: string;
  location: string;
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
  /** Where the inquiry came in, e.g. "via your website". */
  channelMeta: string;
  /** Full conversation, oldest first (customer + operator + AI auto-answers). */
  thread: ThreadMsg[];
  /** AI-suggested reply for a needs_review inquiry — pre-fills the composer. */
  aiDraft?: AiDraft;
}
