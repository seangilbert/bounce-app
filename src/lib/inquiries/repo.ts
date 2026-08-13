import { createAdminClient } from "@/utils/supabase/admin";
import { createClient } from "@/utils/supabase/server";
import { upsertCustomer } from "@/lib/customers/repo";
import { findCustomersByIdentity } from "@/lib/customers/identities";

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
  customerPhone?: string | null;
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
  /** Null when no AI quote was generated (e.g. a lead captured while the
   *  operator is over their monthly AI-quote cap). */
  quote: InquiryQuote | null;
}

export type InquirySender = "customer" | "operator" | "ai";

/** Handoff state (inbox-plan Phase 0) — who answers the customer right now.
 *  Distinct from the lifecycle `status`. */
export type InquiryOwner = "ai" | "needs_human" | "human";

export type MessageDirection = "inbound" | "outbound";

/** One message in an inquiry's conversation thread (see `inquiry_messages`).
 *  channel/direction are optional so other producers (storefront resume in
 *  conversations.ts) compile unchanged; null on pre-0060 rows. */
export interface ThreadMessage {
  id: string;
  sender: InquirySender;
  body: string;
  createdAt: string;
  channel?: string | null;
  direction?: MessageDirection | null;
}

/** A row from the `inquiries` table (snake_case, as stored). */
export interface InquiryRow {
  id: string;
  created_at: string;
  operator_id: string;
  booking_id: string | null;
  customer_name: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  channel: string;
  inbound_message: string;
  start_date: string;
  end_date: string;
  status: "needs_review" | "auto" | "replied" | "dismissed";
  owner: InquiryOwner;
  last_customer_at: string | null;
  last_human_at: string | null;
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
  // Resolve/create the CRM customer first so the inquiry carries customer_id.
  let customerId: string | null = null;
  try {
    customerId = await upsertCustomer(
      input.operatorId,
      {
        email: input.customerEmail,
        phone: input.customerPhone,
        name: input.customerName,
      },
      { source: "inquiry" },
    );
  } catch (e) {
    console.error("[customers] upsert on inquiry failed:", e);
  }
  const { data, error } = await supabase
    .from("inquiries")
    .insert({
      operator_id: input.operatorId,
      booking_id: input.bookingId,
      customer_id: customerId,
      customer_name: input.customerName,
      customer_email: input.customerEmail,
      customer_phone: input.customerPhone ?? null,
      channel: input.channel ?? "website",
      inbound_message: input.inboundMessage,
      start_date: input.startDate,
      end_date: input.endDate,
      status: input.auto ? "auto" : "needs_review",
      // Handoff state alongside the lifecycle: an auto-answered inquiry stays
      // AI-owned; an escalated one needs a human (the ack was already sent).
      owner: input.auto ? "ai" : "needs_human",
      last_customer_at: new Date().toISOString(),
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
  const channel = input.channel ?? "website";
  const seed: {
    inquiry_id: string;
    sender: InquirySender;
    body: string;
    channel: string;
    direction: MessageDirection;
  }[] = [];
  if (input.inboundMessage?.trim())
    seed.push({ inquiry_id: id, sender: "customer", body: input.inboundMessage, channel, direction: "inbound" });
  if (input.auto && input.aiSummary?.trim())
    seed.push({ inquiry_id: id, sender: "ai", body: input.aiSummary, channel, direction: "outbound" });
  if (seed.length) await supabase.from("inquiry_messages").insert(seed);

  return { id };
}

/** Append a message to an inquiry's thread. Direction defaults from the sender
 *  (customer → inbound, ai/operator → outbound); channel when the caller knows it. */
export async function appendInquiryMessage(
  inquiryId: string,
  sender: InquirySender,
  body: string,
  opts?: { channel?: string; direction?: MessageDirection },
): Promise<void> {
  const supabase = createAdminClient();
  const { error } = await supabase.from("inquiry_messages").insert({
    inquiry_id: inquiryId,
    sender,
    body,
    channel: opts?.channel ?? null,
    direction: opts?.direction ?? (sender === "customer" ? "inbound" : "outbound"),
  });
  if (error) throw new Error(`appendInquiryMessage failed: ${error.message}`);
}

/** One inquiry row by id (service-role — used by the AI brain's handoff gate,
 *  which runs on storefront/webhook paths with no operator session). */
export async function getInquiryById(id: string): Promise<InquiryRow | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("inquiries")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`getInquiryById failed: ${error.message}`);
  return (data as InquiryRow) ?? null;
}

/** One inquiry row, operator-scoped (user client — SELECT policy 0054). */
export async function getInquiryForOperator(
  operatorId: string,
  id: string,
): Promise<InquiryRow | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("inquiries")
    .select("*")
    .eq("id", id)
    .eq("operator_id", operatorId)
    .maybeSingle();
  if (error) throw new Error(`getInquiryForOperator failed: ${error.message}`);
  return (data as InquiryRow) ?? null;
}

/** Operator flips the handoff state (Take over / Hand back). User-scoped — the
 *  0057 UPDATE policy enforces tenancy. Taking over records human activity so
 *  the notify-once-per-burst rule resets. Returns false when not found / not
 *  this operator's. */
export async function setInquiryOwnerAsOperator(
  operatorId: string,
  id: string,
  owner: InquiryOwner,
): Promise<boolean> {
  const supabase = createClient();
  const patch: Record<string, unknown> =
    owner === "human" ? { owner, last_human_at: new Date().toISOString() } : { owner };
  const { data, error } = await supabase
    .from("inquiries")
    .update(patch)
    .eq("id", id)
    .eq("operator_id", operatorId)
    .select("id")
    .maybeSingle();
  if (error) throw new Error(`setInquiryOwnerAsOperator failed: ${error.message}`);
  return !!data;
}

/** System-side escalation: lifecycle AND handoff state in one round trip
 *  (service-role — called from the AI brain on storefront/webhook paths). */
export async function markInquiryNeedsHuman(inquiryId: string): Promise<void> {
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("inquiries")
    .update({ status: "needs_review", owner: "needs_human" })
    .eq("id", inquiryId);
  if (error) throw new Error(`markInquiryNeedsHuman failed: ${error.message}`);
}

/** Append an inbound customer message AND touch last_customer_at — one helper
 *  so the webhook and web paths can't forget one half. Service-role. */
export async function recordCustomerInbound(
  inquiryId: string,
  body: string,
  channel: string,
): Promise<void> {
  await appendInquiryMessage(inquiryId, "customer", body, { channel, direction: "inbound" });
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("inquiries")
    .update({ last_customer_at: new Date().toISOString() })
    .eq("id", inquiryId);
  if (error) throw new Error(`recordCustomerInbound failed: ${error.message}`);
}

/**
 * Route an inbound SMS to an inquiry: the most recent non-dismissed inquiry for
 * this customer phone. (Shared-number model — the phone is the routing key.)
 */
export async function findLatestInquiryByPhone(phone: string): Promise<InquiryRow | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("inquiries")
    .select("*")
    .eq("customer_phone", phone)
    .neq("status", "dismissed")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`findLatestInquiryByPhone failed: ${error.message}`);
  return (data as InquiryRow) ?? null;
}

/**
 * Identity-based inbound routing fallback (inbox-plan Phase 2): the newest
 * non-dismissed inquiry belonging to any customer known to hold this handle
 * (channel_identities). Global — same shared-number trust posture as
 * findLatestInquiryByPhone. Unlike the plus-address path, dismissed threads
 * are excluded (no capability token → stay conservative). Service-role.
 */
export async function findLatestInquiryByIdentity(
  channel: "sms" | "email",
  externalId: string,
): Promise<InquiryRow | null> {
  const holders = await findCustomersByIdentity(channel, externalId);
  if (holders.length === 0) return null;
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("inquiries")
    .select("*")
    .in(
      "customer_id",
      holders.map((h) => h.customerId),
    )
    .neq("status", "dismissed")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`findLatestInquiryByIdentity failed: ${error.message}`);
  return (data as InquiryRow) ?? null;
}

/**
 * The inbox thread linked to a booking, if any (linkInquiryToBooking sets it).
 * The reminder sweep uses this to give a quote nudge a plus-addressed Reply-To,
 * so the customer's reply lands back in the live inbox thread.
 */
export async function findInquiryIdByBooking(bookingId: string): Promise<string | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("inquiries")
    .select("id")
    .eq("booking_id", bookingId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`findInquiryIdByBooking failed: ${error.message}`);
  return (data as { id: string } | null)?.id ?? null;
}

/** Bootstrap an SMS thread: record the customer's phone + switch the inquiry to
 *  the `sms` channel (operator-scoped). Idempotent. */
export async function setInquiryPhoneChannel(
  operatorId: string,
  inquiryId: string,
  phone: string,
): Promise<boolean> {
  const supabase = createAdminClient();
  let customerId: string | null = null;
  try {
    customerId = await upsertCustomer(operatorId, { phone }, { source: "inquiry" });
  } catch (e) {
    console.error("[customers] upsert on sms bootstrap failed:", e);
  }
  const patch: Record<string, unknown> = { customer_phone: phone, channel: "sms" };
  if (customerId) patch.customer_id = customerId;
  const { data, error } = await supabase
    .from("inquiries")
    .update(patch)
    .eq("id", inquiryId)
    .eq("operator_id", operatorId)
    .select("id")
    .maybeSingle();
  if (error) throw new Error(`setInquiryPhoneChannel failed: ${error.message}`);
  return !!data;
}

/** Update an inquiry's status (e.g. reopen to needs_review on SMS escalation). */
export async function setInquiryStatus(
  inquiryId: string,
  status: InquiryRow["status"],
): Promise<void> {
  const supabase = createAdminClient();
  const { error } = await supabase.from("inquiries").update({ status }).eq("id", inquiryId);
  if (error) throw new Error(`setInquiryStatus failed: ${error.message}`);
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
    .select("id, inquiry_id, sender, body, created_at, channel, direction")
    .in("inquiry_id", inquiryIds)
    .order("created_at", { ascending: true });
  if (error) throw new Error(`listMessagesByInquiry failed: ${error.message}`);
  const rows = (data ?? []) as {
    id: string;
    inquiry_id: string;
    sender: InquirySender;
    body: string;
    created_at: string;
    channel: string | null;
    direction: MessageDirection | null;
  }[];
  // Tiebreaker for same-timestamp messages (backfill seeded customer + AI at the
  // inquiry's created_at): always show customer → ai → operator.
  const rank: Record<InquirySender, number> = { customer: 0, ai: 1, operator: 2 };
  rows.sort((a, b) =>
    a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : rank[a.sender] - rank[b.sender],
  );
  for (const r of rows) {
    const arr = map.get(r.inquiry_id) ?? [];
    arr.push({
      id: r.id,
      sender: r.sender,
      body: r.body,
      createdAt: r.created_at,
      channel: r.channel,
      direction: r.direction,
    });
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
  let customerId: string | null = null;
  try {
    customerId = await upsertCustomer(
      operatorId,
      { email: contact.email, name: contact.name },
      { source: "inquiry" },
    );
  } catch (e) {
    console.error("[customers] upsert on contact capture failed:", e);
  }
  const patch: Record<string, unknown> = { customer_email: contact.email };
  if (contact.name?.trim()) patch.customer_name = contact.name.trim();
  if (customerId) patch.customer_id = customerId;
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
  contact?: { email?: string | null; phone?: string | null; name?: string | null },
): Promise<void> {
  const supabase = createAdminClient();
  // Also backfill the customer's contact onto the inquiry so the operator can
  // always reach them from the inbox (email / text / call) — an AI auto-quote
  // inquiry is created with no contact; it's collected at checkout. Only fills
  // fields we have a value for; never nulls an existing one.
  const patch: Record<string, unknown> = { booking_id: bookingId };
  if (contact?.email) patch.customer_email = contact.email;
  if (contact?.phone) patch.customer_phone = contact.phone;
  if (contact?.name) patch.customer_name = contact.name;
  if (contact && (contact.email || contact.phone)) {
    try {
      const customerId = await upsertCustomer(operatorId, contact, { source: "inquiry" });
      if (customerId) patch.customer_id = customerId;
    } catch (e) {
      console.error("[customers] upsert on inquiry link failed:", e);
    }
  }
  const { error } = await supabase
    .from("inquiries")
    .update(patch)
    .eq("id", inquiryId)
    .eq("operator_id", operatorId);
  if (error) throw new Error(`linkInquiryToBooking failed: ${error.message}`);
}

/** Count of conversations waiting on a human (for the nav badge). Keyed on the
 *  handoff `owner`, not the lifecycle status: "needs you" means nobody — AI or
 *  operator — currently owns the reply. */
export async function countNeedsHuman(operatorId: string): Promise<number> {
  const supabase = createClient(); // user-scoped (operator SELECT policy, 0054)
  const { count, error } = await supabase
    .from("inquiries")
    .select("id", { count: "exact", head: true })
    .eq("operator_id", operatorId)
    .eq("owner", "needs_human");
  if (error) throw new Error(`countNeedsHuman failed: ${error.message}`);
  return count ?? 0;
}

/** Record the operator's reply and mark the inquiry replied (operator-scoped).
 * Returns the customer's contact so the caller can email the reply. */
export async function replyToInquiry(
  operatorId: string,
  id: string,
  reply: string,
): Promise<{
  customerEmail: string | null;
  customerName: string | null;
  customerPhone: string | null;
  channel: string;
  inboundMessage: string;
} | null> {
  // User-scoped: the inquiries UPDATE + returning SELECT run behind the operator
  // policies (0054/0057). appendInquiryMessage below stays service-role (the
  // inquiry_messages insert is shared with the storefront/webhook thread).
  const supabase = createClient();
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("inquiries")
    .update({
      status: "replied",
      operator_reply: reply,
      replied_at: now,
      // Sending a reply IS taking over: the AI stays quiet from here until an
      // explicit "Hand back to AI" (inbox-plan Phase 0).
      owner: "human",
      last_human_at: now,
    })
    .eq("id", id)
    .eq("operator_id", operatorId)
    .select("customer_email, customer_name, customer_phone, channel, inbound_message")
    .maybeSingle();
  if (error) throw new Error(`replyToInquiry failed: ${error.message}`);
  if (!data) return null; // not found / not this operator's — don't append a message

  // Append to the thread (operator_reply above keeps the "last reply" for the
  // inbox preview; the thread holds the full history).
  await appendInquiryMessage(id, "operator", reply, {
    channel: data.channel,
    direction: "outbound",
  });

  return {
    customerEmail: data.customer_email,
    customerName: data.customer_name,
    customerPhone: data.customer_phone,
    channel: data.channel,
    inboundMessage: data.inbound_message,
  };
}

/** Dismiss an inquiry so it drops out of the inbox (operator-scoped). */
export async function dismissInquiry(operatorId: string, id: string): Promise<void> {
  const supabase = createClient(); // user-scoped (operator UPDATE policy, 0057)
  const { error } = await supabase
    .from("inquiries")
    .update({ status: "dismissed" })
    .eq("id", id)
    .eq("operator_id", operatorId);
  if (error) throw new Error(`dismissInquiry failed: ${error.message}`);
}

/** All inquiries for an operator, newest first (the inbox). */
export async function listInquiries(operatorId: string): Promise<InquiryRow[]> {
  const supabase = createClient(); // user-scoped (operator SELECT policy, 0054)
  const { data, error } = await supabase
    .from("inquiries")
    .select("*")
    .eq("operator_id", operatorId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`listInquiries failed: ${error.message}`);
  return (data ?? []) as InquiryRow[];
}
