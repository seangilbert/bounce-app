import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { getAnthropicClient } from "./client";
import { getDefaultOperator, getOperatorById } from "@/lib/inventory/repo";
import { listItems } from "@/lib/inventory/repo";
import { availabilityForOperator } from "@/lib/inventory/availability";
import { durationDays, lineTotal } from "@/lib/inventory/pricing";
import { createInquiry } from "@/lib/inquiries/repo";
import type { Operator } from "@/lib/inventory/types";

/** Model for the quote assistant. Haiku is a valid cost swap (spec 7.2). */
const ASSISTANT_MODEL = "claude-opus-4-8";

/** Auto-quote only up to this subtotal (minor units). Above it → operator review. */
const AUTO_QUOTE_CAP = Number(process.env.QUOTE_AUTO_CAP_CENTS ?? 75_000); // $750
/** Events sooner than this need a human. */
const MIN_LEAD_HOURS = 48;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * A conversational inquiry: the running chat plus optional context. The agent
 * asks clarifying questions across turns and produces a quote when ready.
 */
export const InquirySchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().min(1),
      }),
    )
    .min(1)
    .max(40),
  // A date the customer already picked, or one the agent resolved on a prior
  // turn and the client echoed back. The agent can also resolve one itself.
  startDate: z.string().regex(ISO_DATE).optional(),
  endDate: z.string().regex(ISO_DATE).optional(),
  customerName: z.string().optional(),
  customerEmail: z.string().email().optional(),
  // Set once an inquiry has been persisted, so we don't create duplicate inbox
  // rows as the conversation continues.
  inquiryId: z.string().uuid().optional(),
  // Which operator's storefront this inquiry is for (else the default operator).
  operatorId: z.string().uuid().optional(),
});
export type Inquiry = z.infer<typeof InquirySchema>;

// The agent's decision each turn: ask for more, or quote.
const ModelOutputSchema = z.object({
  action: z
    .enum(["ask", "quote"])
    .describe('"ask" when you need more info; "quote" when ready to recommend.'),
  reply: z
    .string()
    .describe("Warm, concise message the customer reads — a question, or the quote intro. NO prices."),
  eventDate: z
    .string()
    .nullable()
    .describe("Event date as YYYY-MM-DD if known/derivable from the chat, else null."),
  lineItems: z
    .array(
      z.object({
        itemId: z.string().describe("Exact catalog item id."),
        name: z.string(),
        quantity: z.number().int().positive(),
      }),
    )
    .describe('For "quote": the recommended catalog items. Empty for "ask".'),
  unmatchedRequests: z
    .array(z.string())
    .describe("Things the customer asked for that aren't in the catalog."),
});

export interface QuoteLine {
  itemId: string;
  name: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

export interface ConversationResult {
  /** The assistant's message for this turn (question or quote intro). */
  reply: string;
  status: "gathering" | "quoted" | "review";
  /** Resolved event date (client echoes it back on the next turn). */
  eventDate: string | null;
  quote: {
    lineItems: QuoteLine[];
    subtotal: number;
    suggestedDeposit: number;
    currency: string;
  } | null;
  auto: boolean;
  unmatchedRequests: string[];
  /** Persisted inbox row id (echoed back so we update rather than duplicate). */
  inquiryId: string | null;
}

function hoursUntil(dateStr: string): number {
  const event = new Date(`${dateStr}T00:00:00Z`).getTime();
  return (event - Date.now()) / 3_600_000;
}

function prettyDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

interface PromptItem {
  id: string;
  name: string;
  category: string | null;
  basePrice: number;
  priceUnit: string;
  powerRequired: boolean;
  available?: number;
}

function catalogForPrompt(items: PromptItem[], date: string | null): string {
  return items
    .map((i) => {
      const avail =
        i.available != null ? `, ${i.available} available on ${date}` : "";
      return (
        `- [${i.id}] ${i.name}${i.category ? ` (${i.category})` : ""}: ` +
        `$${(i.basePrice / 100).toFixed(2)} ${i.priceUnit}${avail}` +
        (i.powerRequired ? ", needs power" : "")
      );
    })
    .join("\n");
}

function buildSystemPrompt(
  operator: Operator,
  today: string,
  catalog: string,
  hasDate: boolean,
): string {
  return `You are the friendly booking assistant for ${operator.name}, a party & event rental company${operator.location ? ` in ${operator.location}` : ""}. You chat with a customer to recommend the right rental and prepare a quote.

Today is ${today}.

Your catalog (id, name, price${hasDate ? ", availability" : ""}):
${catalog}

How to behave:
- RECOMMEND — don't interrogate. Customers don't know your specific inventory. If someone asks for "a bounce house," pick the best-fit item yourself and recommend it by name. You may note it's one of a few options and they can swap. NEVER ask the customer to choose between specific catalog items.
- Choose well from the details given: for a young child (e.g. a 5-year-old) or a smaller party, a standard-size bounce house is perfect; for bigger groups, suggest a larger one. Use guest count / age when mentioned.
- Ask a clarifying question ONLY when you genuinely cannot proceed. The most common missing piece is the EVENT DATE — if you don't know it, ask for it warmly. Ask ONE focused question at a time.
- When you know what to recommend AND the event date, set action="quote" with the recommended lineItems (exact catalog ids) and eventDate.
- Resolve dates from natural language relative to today into eventDate (YYYY-MM-DD): e.g. "next Saturday", "July 12", "the 20th". If you truly have no date, set eventDate=null and ask for it.
${hasDate ? "- Availability for the chosen date is shown above; do not recommend an item with 0 available — suggest an available alternative instead.\n" : ""}- If the customer wants something not in the catalog, add it to unmatchedRequests and offer the closest alternative — never invent items.
- "reply" is what the customer reads: warm, brief, human. Do NOT state prices — the system computes and displays them.`;
}

/**
 * Handle one turn of a customer conversation. Returns either a clarifying
 * question ("gathering") or a quote grounded in live inventory ("quoted" when
 * auto-approved, "review" when it needs an operator). The quote is always
 * recomputed from authoritative DB prices; the model's numbers are advisory.
 */
export async function handleInquiry(inquiry: Inquiry): Promise<ConversationResult> {
  const operator = inquiry.operatorId
    ? await getOperatorById(inquiry.operatorId)
    : await getDefaultOperator();
  if (!operator) throw new Error("No operator configured.");

  const today = new Date().toISOString().slice(0, 10);
  const hintStart = inquiry.startDate ?? null;

  // Give the model availability only when we already know a date; otherwise show
  // prices alone (a date-less "availability" would be misleading).
  let promptItems: PromptItem[];
  if (hintStart) {
    const withAvail = await availabilityForOperator(operator.id, hintStart, hintStart);
    promptItems = withAvail.map((i) => ({
      id: i.id,
      name: i.name,
      category: i.category,
      basePrice: i.basePrice,
      priceUnit: i.priceUnit,
      powerRequired: i.powerRequired,
      available: i.availability.available,
    }));
  } else {
    const items = await listItems(operator.id, { activeOnly: true });
    promptItems = items.map((i) => ({
      id: i.id,
      name: i.name,
      category: i.category,
      basePrice: i.basePrice,
      priceUnit: i.priceUnit,
      powerRequired: i.powerRequired,
    }));
  }

  const client = getAnthropicClient();
  const response = await client.messages.parse({
    model: ASSISTANT_MODEL,
    max_tokens: 1024,
    system: buildSystemPrompt(operator, today, catalogForPrompt(promptItems, hintStart), Boolean(hintStart)),
    output_config: { format: zodOutputFormat(ModelOutputSchema) },
    messages: inquiry.messages,
  });
  if (response.stop_reason === "refusal") throw new Error("The assistant declined this request.");
  if (!response.parsed_output) throw new Error("Could not parse the assistant response.");
  const out = response.parsed_output;

  const resolvedDate = out.eventDate ?? hintStart;

  // ── Still gathering: no date, no items, or the model chose to ask. ──
  if (out.action === "ask" || !resolvedDate || out.lineItems.length === 0) {
    return {
      reply: out.reply,
      status: "gathering",
      eventDate: resolvedDate,
      quote: null,
      auto: false,
      unmatchedRequests: out.unmatchedRequests,
      inquiryId: inquiry.inquiryId ?? null,
    };
  }

  // ── Ready to quote. Recompute from authoritative prices + availability. ──
  const startDate = resolvedDate;
  const endDate = inquiry.endDate && inquiry.endDate >= startDate ? inquiry.endDate : startDate;
  const days = durationDays(startDate, endDate);

  const catalog = await availabilityForOperator(operator.id, startDate, endDate);
  const catalogById = new Map(catalog.map((i) => [i.id, i]));

  const lines: QuoteLine[] = [];
  for (const li of out.lineItems) {
    const item = catalogById.get(li.itemId);
    if (!item) continue;
    lines.push({
      itemId: item.id,
      name: item.name,
      quantity: li.quantity,
      unitPrice: item.basePrice,
      lineTotal: lineTotal(item.basePrice, item.priceUnit, li.quantity, days),
    });
  }

  // The model recommended nothing we could resolve — keep the conversation open.
  if (lines.length === 0) {
    return {
      reply:
        "Let me make sure I get you the right thing — could you tell me a bit more about what you're after?",
      status: "gathering",
      eventDate: startDate,
      quote: null,
      auto: false,
      unmatchedRequests: out.unmatchedRequests,
      inquiryId: inquiry.inquiryId ?? null,
    };
  }

  // A recommended item is booked on the date (the model may not have had
  // availability yet on the turn the date was first stated) — offer to adjust.
  const booked = lines.find((l) => l.quantity > (catalogById.get(l.itemId)?.availability.available ?? 0));
  if (booked) {
    return {
      reply: `Ah — the ${booked.name} is already booked for ${prettyDate(startDate)}. Want me to suggest something similar that's free that day?`,
      status: "gathering",
      eventDate: startDate,
      quote: null,
      auto: false,
      unmatchedRequests: out.unmatchedRequests,
      inquiryId: inquiry.inquiryId ?? null,
    };
  }

  const subtotal = lines.reduce((s, l) => s + l.lineTotal, 0);
  const suggestedDeposit = Math.round(subtotal * 0.3);

  // Escalation gate — much lighter now that ambiguity is handled by asking.
  const reasons: string[] = [];
  if (out.unmatchedRequests.length) reasons.push(`unmatched requests: ${out.unmatchedRequests.join(", ")}`);
  if (subtotal > AUTO_QUOTE_CAP)
    reasons.push(`subtotal $${(subtotal / 100).toFixed(2)} over auto-quote cap $${(AUTO_QUOTE_CAP / 100).toFixed(2)}`);
  if (hoursUntil(startDate) < MIN_LEAD_HOURS) reasons.push("rental starts within 48 hours");
  const auto = reasons.length === 0;

  // Persist to the operator inbox once per conversation (first quote only).
  let inquiryId = inquiry.inquiryId ?? null;
  if (!inquiryId) {
    const firstUser = inquiry.messages.find((m) => m.role === "user")?.content ?? "";
    try {
      const created = await createInquiry({
        operatorId: operator.id,
        bookingId: null,
        customerName: inquiry.customerName ?? null,
        customerEmail: inquiry.customerEmail ?? null,
        inboundMessage: firstUser,
        startDate,
        endDate,
        auto,
        confidence: auto ? "high" : "medium",
        aiSummary: out.reply,
        escalationReasons: reasons,
        unmatchedRequests: out.unmatchedRequests,
        quote: { lineItems: lines, subtotal, suggestedDeposit, currency: "usd" },
      });
      inquiryId = created.id;
    } catch (err) {
      console.error("[inquiries] failed to persist inquiry:", err);
    }
  }

  return {
    reply: out.reply,
    status: auto ? "quoted" : "review",
    eventDate: startDate,
    quote: { lineItems: lines, subtotal, suggestedDeposit, currency: "usd" },
    auto,
    unmatchedRequests: out.unmatchedRequests,
    inquiryId,
  };
}
