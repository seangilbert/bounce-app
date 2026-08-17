import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { getAnthropicClient } from "./client";
import { getOperatorById } from "@/lib/inventory/repo";
import { listItems } from "@/lib/inventory/repo";
import { availabilityForOperator } from "@/lib/inventory/availability";
import { durationDays, lineTotal, priceBreakdown } from "@/lib/inventory/pricing";
import { assessRange, normalizeSchedule } from "@/lib/availability/schedule";
import {
  createInquiry,
  getInquiryById,
  recordCustomerInbound,
  appendInquiryMessage,
  markInquiryNeedsHuman,
  type InquiryRow,
} from "@/lib/inquiries/repo";
import { notifyOperatorNewInquiry } from "@/lib/email";
import { getQuoteQuota, incrementAiQuoteUsage } from "@/lib/usage/ai-quotes";
import { planCapabilities } from "@/lib/plans";
import { listAssistantPromos } from "@/lib/promos/repo";
import { buildOperatorConfig } from "./operator-config";
import type { Operator } from "@/lib/inventory/types";

/**
 * Per-task models — three independent cost dials (docs/pricing-plan.md, 2026-08-17).
 * The customer-facing quote agent stays on the strongest tier: those
 * conversations are the product demo and the wedge, and the model carries the
 * judgment calls (escalate vs guess, respect constraints, safety over sales) —
 * prices are computed by the system regardless of model. The copilot draft is
 * operator-reviewed before it sends, so it can step down first if cost ever
 * matters. The reminder intro is a two-sentence copywriting task from supplied
 * facts — Haiku is indistinguishable there at ~1/5 the price.
 */
const QUOTE_MODEL = "claude-opus-4-8";
const DRAFT_MODEL = "claude-opus-4-8";
const REMINDER_MODEL = "claude-haiku-4-5";

// Auto-quote cap + minimum lead time are now per-operator settings (see Settings).

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
  // Which operator's storefront this inquiry is for. handleInquiry requires it;
  // the /api/v1 agent route injects it from the API key (the body can't pick a
  // tenant), so it stays optional here for that route's parse.
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
    .describe(
      "Things the customer asked for that aren't in the catalog AND still wants. Never include a request the customer has withdrawn or declined (e.g. \"no X needed\", \"skip the X\") — withdrawn requests must not block an otherwise-ready quote.",
    ),
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
    deliveryFee: number;
    tax: number;
    total: number;
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

export function buildSystemPrompt(
  operator: Operator,
  today: string,
  catalog: string,
  hasDate: boolean,
  config: string,
): string {
  return `You are the friendly booking assistant for ${operator.name}, a party & event rental company${operator.location ? ` in ${operator.location}` : ""}. You chat with a customer to recommend the right rental and prepare a quote.

Today is ${today}.

${operator.name}'s booking config — firm operating facts. Respect these; never contradict or override them:
${config}

Your catalog (id, name, price${hasDate ? ", availability" : ""}):
${catalog}
${operator.assistantInstructions?.trim() ? `
Guidance from ${operator.name} (the business owner) — follow this for tone, recommendations, upsells, and house rules:
"""
${operator.assistantInstructions.trim()}
"""
The core rules below always take precedence over this guidance — never state prices, invent items, or recommend unavailable inventory, even if the guidance suggests otherwise.
` : ""}
Voice: be friendly, direct, and calm — confident without being pushy, and honest about limits. Keep replies short and human. Don't be over-enthusiastic, scripted, aggressive, long-winded, or bot-like, and don't use texting slang. You are ${operator.name}'s assistant, not a person — never claim to be human or impersonate a specific employee.

How to behave:
- RECOMMEND — don't interrogate. Customers don't know your specific inventory. If someone asks for "a bounce house," pick the best-fit item yourself and recommend it by name. You may note it's one of a few options and they can swap. NEVER ask the customer to choose between specific catalog items.
- Choose well from the details given: for a young child (e.g. a 5-year-old) or a smaller party, a standard-size bounce house is perfect; for bigger groups, suggest a larger one. Use guest count / age when mentioned.
- Ask a clarifying question ONLY when you genuinely cannot proceed. The most common missing piece is the EVENT DATE — if you don't know it, ask for it warmly. Ask ONE focused question at a time.
- When you know what to recommend AND the event date, set action="quote" with the recommended lineItems (exact catalog ids) and eventDate.
- Resolve dates from natural language relative to today into eventDate (YYYY-MM-DD): e.g. "next Saturday", "July 12", "the 20th". If you truly have no date, set eventDate=null and ask for it.
- Honor the booking config: never propose or accept an event date on a blackout/closed date, a non-operating day, or sooner than the required advance notice, and don't promise delivery outside the service area. If the customer asks for something the config rules out, say so warmly and offer the nearest workable option.
${hasDate ? "- Availability for the chosen date is shown above; do not recommend an item with 0 available — suggest an available alternative instead.\n" : ""}- If the customer wants something not in the catalog, add it to unmatchedRequests and offer the closest alternative — never invent items. Drop it from unmatchedRequests the moment they withdraw or decline it — that list is only for things they STILL want.
- "reply" is what the customer reads: warm, brief, human. Do NOT state prices — the system computes and displays them.
- REUSE what's already known — never re-ask for something the customer gave you (date, contact, item interest, a prior quote). If a question comes out of order, answer it, then return to where you left off.
- HAND OFF to a human without friction whenever the customer asks for a person, seems upset or repeatedly misunderstood, or raises a complaint, refund, injury, damage, legal, payment, or policy-exception issue. Tell them you'll pass the conversation to the team and flag it for follow-up. Never make someone argue to reach a person.
- SAFETY beats a sale, always. If a setup sounds unsafe or unsuitable for the item, raise it and hand off rather than pushing the booking. (Any item-specific hazards to watch for come from the owner's guidance above.)
- ADD-ONS: offer at most two relevant add-ons at a time, each with a one-clause reason and whether it's optional or required. Never repeat an offer after a decline, and never run a full add-on checklist. Prefer bundles that add value over discounting the base rental.
- OBJECTIONS: if price is the concern, ask their budget and offer a lower-cost option before any discount; if they're "still deciding," ask what they're weighing (price, size, age range, item, or company).
- DISCOUNTS: never invent or imply a discount that isn't active in the config above; don't stack unless allowed; and don't volunteer an extra base-rental discount to someone already ready to book.
- Respect "no" immediately — stop upsells and follow-ups on any decline or opt-out.`;
}

export interface HandleInquiryOptions {
  /** Append this turn's customer message + AI reply to inquiry_messages when an
   *  inquiry row already exists (web/API routes pass true). The Twilio webhook
   *  omits it — it appends itself around the call, so a thrown AI turn still
   *  keeps the inbound message. */
  persistTurn?: boolean;
}

/** What the customer hears while a human owns the thread (inbox-plan Phase 0). */
export const HUMAN_OWNED_ACK =
  "Thanks — the team has your message and will get back to you directly.";

/**
 * Handle one turn of a customer conversation. Returns either a clarifying
 * question ("gathering") or a quote grounded in live inventory ("quoted" when
 * auto-approved, "review" when it needs an operator). The quote is always
 * recomputed from authoritative DB prices; the model's numbers are advisory.
 */
export async function handleInquiry(
  inquiry: Inquiry,
  opts: HandleInquiryOptions = {},
): Promise<ConversationResult> {
  // Require an explicit operator — never fall back to a "default" one. With more
  // than one tenant, defaulting would serve one operator's agent (its custom
  // instructions + config) to another operator's customer. Every real entry
  // point supplies it: the storefront by slug, the /api/v1 agent by key, SMS
  // from the matched thread.
  if (!inquiry.operatorId) throw new Error("handleInquiry requires an operatorId.");
  const operator = await getOperatorById(inquiry.operatorId);
  if (!operator) throw new Error(`Operator ${inquiry.operatorId} not found.`);

  // ── Handoff gate (inbox-plan Phase 0) — before quota and any model call. ──
  // When a human owns (or was asked to own) this thread, the AI stays quiet:
  // save the customer's message so the operator sees it, return a courtesy
  // ack. The ack is NOT persisted as a thread message — it's a receipt, not
  // conversation, and would clutter the operator's thread once per message.
  // This lives here (not in the routes) so every entry point — storefront,
  // /api/v1 agent, SMS — is protected even if a route forgets.
  const lastUser = [...inquiry.messages].reverse().find((m) => m.role === "user");
  let existing: InquiryRow | null = null;
  if (inquiry.inquiryId) {
    existing = await getInquiryById(inquiry.inquiryId);
    if (existing && existing.owner !== "ai") {
      if (opts.persistTurn && lastUser) {
        try {
          await recordCustomerInbound(existing.id, lastUser.content, existing.channel);
        } catch (err) {
          console.error("[inquiries] failed to persist paused-thread message:", err);
        }
      }
      return {
        reply: HUMAN_OWNED_ACK,
        // "review" keeps the storefront's contact-capture box visible on
        // escalated threads; "gathering" leaves an operator-owned chat open.
        status: existing.owner === "needs_human" ? "review" : "gathering",
        eventDate: inquiry.startDate ?? null,
        quote: null,
        auto: false,
        unmatchedRequests: [],
        inquiryId: existing.id,
      };
    }
  }

  // Persist this turn's customer message for pre-existing threads. (The first
  // turn's message is seeded by createInquiry; without this, web turns after
  // creation lived only in the client and an operator taking over never saw
  // them.)
  if (opts.persistTurn && existing && lastUser) {
    try {
      await recordCustomerInbound(existing.id, lastUser.content, existing.channel);
    } catch (err) {
      console.error("[inquiries] failed to persist customer turn:", err);
    }
  }

  const result = await runInquiryTurn(inquiry, operator);

  if (existing) {
    // Persist the AI's reply so the operator thread mirrors the conversation.
    if (opts.persistTurn && result.reply) {
      try {
        await appendInquiryMessage(existing.id, "ai", result.reply, {
          channel: existing.channel,
          direction: "outbound",
        });
      } catch (err) {
        console.error("[inquiries] failed to persist AI turn:", err);
      }
    }
    // Centralized escalation for continuing threads: a mid-conversation
    // "review" outcome flips lifecycle + handoff state together. (New
    // conversations set both inside createInquiry.)
    if (result.status === "review") {
      try {
        await markInquiryNeedsHuman(existing.id);
      } catch (err) {
        console.error("[inquiries] failed to mark needs-human:", err);
      }
    }
  }

  return result;
}

/** Load the grounded prompt context — catalog (with availability when a date is
 *  known) + the operator's structured config. Shared by the customer agent and
 *  the operator copilot so their grounding never drifts. */
async function loadPromptContext(
  operator: Operator,
  hintStart: string | null,
): Promise<{ today: string; promptItems: PromptItem[]; config: string }> {
  const today = new Date().toISOString().slice(0, 10);

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

  // Structured config from the operator's own live settings (service area,
  // hours, blackouts, lead time, deposit terms, active auto-promos).
  const autoPromos = await listAssistantPromos(operator.id, today);
  const config = buildOperatorConfig(operator, today, autoPromos);

  return { today, promptItems, config };
}

/** The copilot mode-switch appended to the customer-agent system prompt when
 *  drafting a reply for the operator to review. Exported for prompt tests. */
export function buildDraftInstruction(operatorName: string): string {
  return `

MODE CHANGE — you are now drafting a message that a human at ${operatorName} will review, edit, and send to the customer under the business's own name. Write ONLY the message body: no subject line, no signature, no surrounding quotes, no commentary. First person plural as the business ("we"). Keep it short, warm, and concrete. Unlike normal mode, you may reference a price if (and only if) it already appears earlier in this conversation. If the right content depends on something only the operator knows (a custom price, a policy exception, a schedule promise), put a clearly-marked [FILL IN] placeholder there instead of inventing it.`;
}

/**
 * AI-as-copilot (inbox-plan Phase 0): one-shot suggested reply for the
 * operator's composer. Grounded in the same catalog + config as the customer
 * agent; plain text out — no structured output, no pricing recompute, no
 * persistence, no metering (the caller rate-limits).
 */
export async function draftOperatorReply(
  operatorId: string,
  messages: { role: "user" | "assistant"; content: string }[],
  opts?: { startDate?: string | null },
): Promise<string> {
  const operator = await getOperatorById(operatorId);
  if (!operator) throw new Error(`Operator ${operatorId} not found.`);
  const hintStart = opts?.startDate ?? null;
  const { today, promptItems, config } = await loadPromptContext(operator, hintStart);

  const client = getAnthropicClient();
  const response = await client.messages.create({
    model: DRAFT_MODEL,
    max_tokens: 512,
    // Two system blocks, deliberately: block 1 is the byte-identical grounded
    // prompt the quote agent caches (same model → same cache), so a draft
    // requested minutes after an AI turn reads that entry instead of paying
    // full price; the mode-switch rides after the breakpoint as its own block.
    // NOTE: if DRAFT_MODEL ever diverges from QUOTE_MODEL, the sharing stops
    // (caches are model-scoped) but each call still caches for itself.
    system: [
      {
        type: "text",
        text: buildSystemPrompt(operator, today, catalogForPrompt(promptItems, hintStart), Boolean(hintStart), config),
        cache_control: { type: "ephemeral" },
      },
      { type: "text", text: buildDraftInstruction(operator.name) },
    ],
    // Always end on a user turn: the thread can end with an ai/operator message,
    // and a trailing assistant turn is a prefill (400 on this model family).
    // Consecutive same-role user turns are valid — the API merges them.
    messages: [...messages, { role: "user", content: "Draft the next reply to send to this customer now." }],
  });
  if (response.stop_reason === "refusal") throw new Error("The assistant declined to draft this reply.");
  const text = response.content.find((b) => b.type === "text");
  if (!text || text.type !== "text" || !text.text.trim()) throw new Error("No draft returned.");
  return text.text.trim();
}

/* ══════════════ Follow-up agent (cron reminders) ══════════════ */

export type ReminderKind = "balance" | "contract" | "quote";

export interface ReminderFacts {
  customerFirstName?: string;
  /** e.g. "Saturday, August 15" — pre-formatted by the sweep. */
  eventDateLabel: string;
  itemNames: string[];
  /** e.g. "$150" — balance kind only. */
  balanceLabel?: string;
  /** e.g. "$450" — quote kind only (the quoted total). */
  totalLabel?: string;
}

/** System prompt for the auto-sent reminder intro. Exported for prompt tests.
 *  Unlike the copilot's buildDraftInstruction, there is NO placeholder escape
 *  hatch — nothing reviews this before it reaches the customer. */
export function buildReminderSystemPrompt(operator: Operator, kind: ReminderKind): string {
  const point =
    kind === "balance"
      ? "The point of the email: a remaining balance is due before their event, payable online via the button below your text."
      : kind === "contract"
        ? "The point of the email: their rental agreement still needs a signature; the signing email comes from SignWell."
        : "The point of the email: we sent them a quote a few days ago and their event date is coming up — they can review and reserve online via the button below your text. Check in warmly; never pressure.";
  return `You write the opening of a short reminder email sent automatically on behalf of ${operator.name}, a party & event rental business. Write 2-3 friendly sentences as the business ("we") — warm and helpful, never pushy. This goes straight to the customer with no human review.

Hard rules:
- Use ONLY the facts provided in the message. Never invent prices, dates, policies, discounts, or promises.
- No placeholders of any kind — no brackets, no fill-in markers, no blanks left to complete.
- No links or URLs — the email template adds the button/next step.
- No subject line, no signature, no sign-off; just the 2-3 sentences.
- ${point}${
    operator.assistantInstructions?.trim()
      ? `\n\nTone guidance from the business (does not override the rules above):\n${operator.assistantInstructions.trim()}`
      : ""
  }`;
}

/**
 * AI-written intro for an automated reminder email. Throws on refusal, empty
 * output, or anything that smells like a placeholder/link leak — the CALLER
 * catches and falls back to deterministic copy (fallbackReminderIntro), so a
 * model hiccup never blocks a send. Deliberately does NOT load the catalog
 * context (irrelevant to a reminder) and is NOT metered against the
 * customer-facing AI-quote cap; the sweep's per-run caps bound spend.
 */
export async function draftReminderIntro(
  operator: Operator,
  kind: ReminderKind,
  facts: ReminderFacts,
): Promise<string> {
  const client = getAnthropicClient();
  const factLines = [
    `customer first name: ${facts.customerFirstName ?? "unknown"}`,
    `event date: ${facts.eventDateLabel}`,
    `items: ${facts.itemNames.join(", ") || "their rental"}`,
    ...(facts.balanceLabel ? [`balance due: ${facts.balanceLabel}`] : []),
    ...(facts.totalLabel ? [`quoted total: ${facts.totalLabel}`] : []),
  ];
  // No cache_control here: the prompt is far below Haiku's minimum cacheable
  // prefix (4096 tokens) and each reminder is a one-shot send anyway.
  const response = await client.messages.create({
    model: REMINDER_MODEL,
    max_tokens: 300,
    system: buildReminderSystemPrompt(operator, kind),
    messages: [
      { role: "user", content: `Facts (ground truth):\n${factLines.join("\n")}\n\nWrite the intro now.` },
    ],
  });
  if (response.stop_reason === "refusal") throw new Error("The assistant declined to draft this reminder.");
  const text = response.content.find((b) => b.type === "text");
  if (!text || text.type !== "text" || !text.text.trim()) throw new Error("No reminder intro returned.");
  const out = text.text.trim();
  // Belt-and-braces: an auto-sent email must never carry a placeholder or a
  // model-invented link. Suspicious output → throw → caller falls back.
  if (/[[\]]|https?:/i.test(out)) throw new Error("Reminder intro failed the safety check.");
  return out;
}

/** One grounded AI turn — quota gate, model call, DB-grounded quote, first-turn
 *  persistence. Split from handleInquiry so the handoff gate/persistence wrapper
 *  stays readable. */
async function runInquiryTurn(inquiry: Inquiry, operator: Operator): Promise<ConversationResult> {
  // Free-tier AI-quote cap. Gate a *new* conversation (no inquiryId yet) BEFORE
  // any model call, so a capped operator never spends against our Anthropic bill;
  // an in-progress thread continues so we don't abandon a customer mid-chat. The
  // count is bumped once below, when the inbox inquiry is first persisted. Paid
  // plans are unlimited and getQuoteQuota short-circuits without a DB read.
  const metered = Number.isFinite(planCapabilities(operator).aiQuotesPerMonth);
  if (!inquiry.inquiryId) {
    const quota = await getQuoteQuota(operator);
    if (quota.atLimit) return cappedInquiry(operator, inquiry);
  }

  const hintStart = inquiry.startDate ?? null;
  const { today, promptItems, config } = await loadPromptContext(operator, hintStart);

  const client = getAnthropicClient();
  const response = await client.messages.parse({
    model: QUOTE_MODEL,
    max_tokens: 1024,
    // Prompt caching: the grounded system prompt (core rules + operator
    // instructions + catalog + config) is the bulk of every turn's input and is
    // byte-identical across the turns of a conversation — the breakpoint makes
    // turns 2..n read it at ~10% of the input rate (5-min TTL comfortably
    // covers a live chat). The copilot draft call shares this exact prefix, so
    // a draft minutes after an AI turn reads the same entry. Invalidation is
    // the correct behavior here: a new day, a settings edit, or a catalog
    // change alters the bytes and simply re-caches. Below the model's minimum
    // cacheable prefix (a tiny catalog) it silently doesn't cache — harmless.
    system: [
      {
        type: "text",
        text: buildSystemPrompt(operator, today, catalogForPrompt(promptItems, hintStart), Boolean(hintStart), config),
        cache_control: { type: "ephemeral" },
      },
    ],
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

  // The requested date must be within the operator's availability schedule.
  const availability = assessRange(normalizeSchedule(operator.availabilityConfig), startDate, endDate);
  if (!availability.ok) {
    return {
      reply: availability.message ?? "We're not available that date — could you pick another?",
      status: "gathering",
      eventDate: startDate,
      quote: null,
      auto: false,
      unmatchedRequests: out.unmatchedRequests,
      inquiryId: inquiry.inquiryId ?? null,
    };
  }

  const subtotal = lines.reduce((s, l) => s + l.lineTotal, 0);
  // Zones/distance pricing needs the delivery address, which we don't have in
  // chat. Quote items + tax now; delivery is added at checkout once the customer
  // enters an address (createBooking resolves it authoritatively).
  const deliveryDeferred = operator.deliveryMode !== "flat";
  const bd = priceBreakdown(
    subtotal,
    deliveryDeferred ? 0 : operator.deliveryFeeCents,
    operator.taxPercent,
    operator.deliveryTaxable,
  );
  const suggestedDeposit = Math.round((bd.total * operator.depositPercent) / 100);

  // Escalation gate — much lighter now that ambiguity is handled by asking.
  const reasons: string[] = [];
  if (out.unmatchedRequests.length) reasons.push(`unmatched requests: ${out.unmatchedRequests.join(", ")}`);
  if (bd.total > operator.autoQuoteCapCents)
    reasons.push(
      `total $${(bd.total / 100).toFixed(2)} over auto-quote cap $${(operator.autoQuoteCapCents / 100).toFixed(2)}`,
    );
  if (hoursUntil(startDate) < operator.minLeadHours)
    reasons.push(`rental starts within ${operator.minLeadHours} hours`);
  const auto = reasons.length === 0;

  // On escalation the auto-computed quote isn't self-bookable (the operator wants
  // to review / send a custom price), so the customer-facing message must NOT
  // read like a ready-to-book quote. The model's original reply is still kept as
  // the operator's suggested draft (aiSummary) below.
  const customerReply = auto
    ? deliveryDeferred
      ? `${out.reply}\n\nDelivery is added at checkout based on your address.`
      : out.reply
    : `Thanks! This one's a bit beyond an instant quote — ${operator.name} will put together a custom price for you. Just leave your email below and they'll send it over, usually within a few hours.`;

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
        quote: { lineItems: lines, subtotal, deliveryFee: bd.deliveryFee, tax: bd.tax, total: bd.total, suggestedDeposit, currency: "usd" },
      });
      inquiryId = created.id;
      // Count this conversation once against the operator's monthly AI-quote
      // cap (metered plans only). Best-effort — a metering miss shouldn't fail
      // a quote the customer already received.
      if (metered) {
        try {
          await incrementAiQuoteUsage(operator.id);
        } catch (err) {
          console.error("[usage] AI-quote increment failed:", err);
        }
      }
    } catch (err) {
      console.error("[inquiries] failed to persist inquiry:", err);
    }

    // Alert the operator to inquiries that need their review (best-effort).
    if (!auto && operator.contactEmail && operator.notifyNewInquiry) {
      const base = process.env.NEXT_PUBLIC_APP_URL ?? "https://movables.ai";
      try {
        await notifyOperatorNewInquiry({
          to: operator.contactEmail,
          businessName: operator.name,
          customer: inquiry.customerName ?? "A customer",
          message: firstUser,
          link: `${base}/inquiries`,
        });
      } catch (err) {
        console.error("[inquiries] operator alert failed:", err);
      }
    }
  }

  return {
    reply: customerReply,
    status: auto ? "quoted" : "review",
    eventDate: startDate,
    quote: { lineItems: lines, subtotal, deliveryFee: bd.deliveryFee, tax: bd.tax, total: bd.total, suggestedDeposit, currency: "usd" },
    auto,
    unmatchedRequests: out.unmatchedRequests,
    inquiryId,
  };
}

/**
 * Over the monthly AI-quote cap: skip the model entirely, but still capture the
 * lead so the operator doesn't lose the customer — persist a needs-review
 * inquiry (no AI draft, no quote), alert the operator, and ask the customer for
 * an email so a human can follow up. The customer never sees plan/billing
 * language; the operator learns they hit the cap via the inbox + this lead.
 */
async function cappedInquiry(operator: Operator, inquiry: Inquiry): Promise<ConversationResult> {
  const firstUser = inquiry.messages.find((m) => m.role === "user")?.content ?? "";
  const today = new Date().toISOString().slice(0, 10);
  const start = inquiry.startDate ?? today;
  const end = inquiry.endDate && inquiry.endDate >= start ? inquiry.endDate : start;

  let inquiryId: string | null = null;
  try {
    const created = await createInquiry({
      operatorId: operator.id,
      bookingId: null,
      customerName: inquiry.customerName ?? null,
      customerEmail: inquiry.customerEmail ?? null,
      inboundMessage: firstUser,
      startDate: start,
      endDate: end,
      auto: false,
      confidence: "low",
      aiSummary:
        "Instant quoting is paused — this month's AI-quote limit was reached. Follow up with this customer directly (consider upgrading to keep auto-quoting).",
      escalationReasons: ["ai_quote_cap_reached"],
      unmatchedRequests: [],
      quote: null,
    });
    inquiryId = created.id;
  } catch (err) {
    console.error("[inquiries] failed to persist capped lead:", err);
  }

  if (operator.contactEmail && operator.notifyNewInquiry) {
    const base = process.env.NEXT_PUBLIC_APP_URL ?? "https://movables.ai";
    try {
      await notifyOperatorNewInquiry({
        to: operator.contactEmail,
        businessName: operator.name,
        customer: inquiry.customerName ?? "A customer",
        message: firstUser,
        link: `${base}/inquiries`,
      });
    } catch (err) {
      console.error("[inquiries] capped-lead alert failed:", err);
    }
  }

  return {
    reply: `Thanks for reaching out! I can't put together an instant quote right this second — leave your email below and ${operator.name} will follow up with a custom quote, usually within a few hours.`,
    status: "review",
    eventDate: inquiry.startDate ?? null,
    quote: null,
    auto: false,
    unmatchedRequests: [],
    inquiryId,
  };
}
