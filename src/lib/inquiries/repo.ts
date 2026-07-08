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
  deliveryFee?: number;
  tax?: number;
  total?: number;
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

export type InquirySender = "customer" | "operator" | "ai";

/** One message in an inquiry's conversation thread (see `inquiry_messages`). */
export interface ThreadMessage {
  id: string;
  sender: InquirySender;
  body: string;
  createdAt: string;
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
  const id = data.id as string;

  // Seed the conversation thread: the customer's inbound message + (for an
  // auto-answered inquiry) the AI's reply. A needs_review draft stays a
  // suggestion, not a thread message, until the operator sends it.
  const seed: { inquiry_id: string; sender: InquirySender; body: string }[] = [];
  if (input.inboundMessage?.trim()) seed.push({ inquiry_id: id, sender: "customer", body: input.inboundMessage });
  if (input.auto && input.aiSummary?.trim()) seed.push({ inquiry_id: id, sender: "ai", body: input.aiSummary });
  if (seed.length) await supabase.from("inquiry_messages").insert(seed);

  return { id };
}

/** Append a message to an inquiry's thread. */
export async function appendInquiryMessage(
  inquiryId: string,
  sender: InquirySender,
  body: string,
): Promise<void> {
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("inquiry_messages")
    .insert({ inquiry_id: inquiryId, sender, body });
  if (error) throw new Error(`appendInquiryMessage failed: ${error.message}`);
}

/** Thread messages for a set of inquiries, oldest first, grouped by inquiry id. */
export async function listMessagesByInquiry(
  inquiryIds: string[],
): Promise<Map<string, ThreadMessage[]>> {
  const map = new Map<string, ThreadMessage[]>();
  if (inquiryIds.length === 0) return map;
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("inquiry_messages")
    .select("id, inquiry_id, sender, body, created_at")
    .in("inquiry_id", inquiryIds)
    .order("created_at", { ascending: true });
  if (error) throw new Error(`listMessagesByInquiry failed: ${error.message}`);
  const rows = (data ?? []) as { id: string; inquiry_id: string; sender: InquirySender; body: string; created_at: string }[];
  // Tiebreaker for same-timestamp messages (backfill seeded customer + AI at the
  // inquiry's created_at): always show customer → ai → operator.
  const rank: Record<InquirySender, number> = { customer: 0, ai: 1, operator: 2 };
  rows.sort((a, b) =>
    a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : rank[a.sender] - rank[b.sender],
  );
  for (const r of rows) {
    const arr = map.get(r.inquiry_id) ?? [];
    arr.push({ id: r.id, sender: r.sender, body: r.body, createdAt: r.created_at });
    map.set(r.inquiry_id, arr);
  }
  return map;
}

/** Attach the customer's contact to an inquiry (from the storefront chat when it
 *  escalates), so the operator's reply can actually be delivered. Scoped by
 *  operator + inquiry id; only fills fields, never clears them. */
export async function setInquiryContact(
  operatorId: string,
  inquiryId: string,
  contact: { email: string; name?: string | null },
): Promise<boolean> {
  const supabase = createAdminClient();
  const patch: Record<string, unknown> = { customer_email: contact.email };
  if (contact.name?.trim()) patch.customer_name = contact.name.trim();
  const { data, error } = await supabase
    .from("inquiries")
    .update(patch)
    .eq("id", inquiryId)
    .eq("operator_id", operatorId)
    .select("id")
    .maybeSingle();
  if (error) throw new Error(`setInquiryContact failed: ${error.message}`);
  return !!data;
}

/** Tie an inquiry to the booking it produced (best-effort; operator-scoped). */
export async function linkInquiryToBooking(
  operatorId: string,
  inquiryId: string,
  bookingId: string,
): Promise<void> {
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("inquiries")
    .update({ booking_id: bookingId })
    .eq("id", inquiryId)
    .eq("operator_id", operatorId);
  if (error) throw new Error(`linkInquiryToBooking failed: ${error.message}`);
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

/** Record the operator's reply and mark the inquiry replied (operator-scoped).
 * Returns the customer's contact so the caller can email the reply. */
export async function replyToInquiry(
  operatorId: string,
  id: string,
  reply: string,
): Promise<{ customerEmail: string | null; customerName: string | null; inboundMessage: string } | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("inquiries")
    .update({ status: "replied", operator_reply: reply, replied_at: new Date().toISOString() })
    .eq("id", id)
    .eq("operator_id", operatorId)
    .select("customer_email, customer_name, inbound_message")
    .maybeSingle();
  if (error) throw new Error(`replyToInquiry failed: ${error.message}`);
  if (!data) return null; // not found / not this operator's — don't append a message

  // Append to the thread (operator_reply above keeps the "last reply" for the
  // inbox preview; the thread holds the full history).
  await appendInquiryMessage(id, "operator", reply);

  return {
    customerEmail: data.customer_email,
    customerName: data.customer_name,
    inboundMessage: data.inbound_message,
  };
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
