import { createAdminClient } from "@/utils/supabase/admin";

export interface InquiryQuoteLine {
  itemId: string;
  name: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

export interface InquiryQuote {
  lineItems: InquiryQuoteLine[];
  subtotal: number;
  suggestedDeposit: number;
  currency: string;
}

export interface CreateInquiryInput {
  operatorId: string;
  bookingId: string | null;
  customerName: string | null;
  customerEmail: string | null;
  channel?: string;
  inboundMessage: string;
  startDate: string;
  endDate: string;
  auto: boolean;
  confidence: "high" | "medium" | "low";
  /** The model's customer-facing draft reply (persisted even when escalated). */
  aiSummary: string;
  escalationReasons: string[];
  unmatchedRequests: string[];
  quote: InquiryQuote;
}

/** A row from the `inquiries` table (snake_case, as stored). */
export interface InquiryRow {
  id: string;
  created_at: string;
  operator_id: string;
  booking_id: string | null;
  customer_name: string | null;
  customer_email: string | null;
  channel: string;
  inbound_message: string;
  start_date: string;
  end_date: string;
  status: "needs_review" | "auto" | "replied" | "dismissed";
  auto: boolean;
  confidence: "high" | "medium" | "low" | null;
  ai_summary: string | null;
  escalation_reasons: string[];
  unmatched_requests: string[];
  quote: InquiryQuote | null;
  customer_type: string | null;
  location: string | null;
  operator_reply: string | null;
}

/** Persist a handled inquiry so the operator inbox can show the real AI draft. */
export async function createInquiry(input: CreateInquiryInput): Promise<{ id: string }> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("inquiries")
    .insert({
      operator_id: input.operatorId,
      booking_id: input.bookingId,
      customer_name: input.customerName,
      customer_email: input.customerEmail,
      channel: input.channel ?? "website",
      inbound_message: input.inboundMessage,
      start_date: input.startDate,
      end_date: input.endDate,
      status: input.auto ? "auto" : "needs_review",
      auto: input.auto,
      confidence: input.confidence,
      ai_summary: input.aiSummary,
      escalation_reasons: input.escalationReasons,
      unmatched_requests: input.unmatchedRequests,
      quote: input.quote,
    })
    .select("id")
    .single();
  if (error) throw new Error(`createInquiry failed: ${error.message}`);
  return { id: data.id as string };
}

/** Count of inquiries awaiting operator review (for the nav badge). */
export async function countNeedsReview(operatorId: string): Promise<number> {
  const supabase = createAdminClient();
  const { count, error } = await supabase
    .from("inquiries")
    .select("id", { count: "exact", head: true })
    .eq("operator_id", operatorId)
    .eq("status", "needs_review");
  if (error) throw new Error(`countNeedsReview failed: ${error.message}`);
  return count ?? 0;
}

/** Record the operator's reply and mark the inquiry replied (operator-scoped). */
export async function replyToInquiry(operatorId: string, id: string, reply: string): Promise<void> {
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("inquiries")
    .update({ status: "replied", operator_reply: reply, replied_at: new Date().toISOString() })
    .eq("id", id)
    .eq("operator_id", operatorId);
  if (error) throw new Error(`replyToInquiry failed: ${error.message}`);
}

/** Dismiss an inquiry so it drops out of the inbox (operator-scoped). */
export async function dismissInquiry(operatorId: string, id: string): Promise<void> {
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("inquiries")
    .update({ status: "dismissed" })
    .eq("id", id)
    .eq("operator_id", operatorId);
  if (error) throw new Error(`dismissInquiry failed: ${error.message}`);
}

/** All inquiries for an operator, newest first (the inbox). */
export async function listInquiries(operatorId: string): Promise<InquiryRow[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("inquiries")
    .select("*")
    .eq("operator_id", operatorId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`listInquiries failed: ${error.message}`);
  return (data ?? []) as InquiryRow[];
}
