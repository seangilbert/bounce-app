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

export interface InquiryDetail {
  whyBanner?: string;
  /** The customer's inbound message. */
  message: { text: string; meta: string };
  /** Present when the assistant escalated and drafted a reply for review. */
  aiDraft?: AiDraft;
  /** Present for already auto-handled inquiries. */
  handledNote?: string;
}
