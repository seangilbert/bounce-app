import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { getAnthropicClient } from "./client";
import { getDefaultOperator } from "@/lib/inventory/repo";
import { availabilityForOperator, type ItemAvailability } from "@/lib/inventory/availability";
import { durationDays, lineTotal } from "@/lib/inventory/pricing";
import { createBooking, setBookingStatus } from "@/lib/bookings/repo";

/** Model for the quote assistant. Haiku is a valid cost swap (spec 7.2). */
const ASSISTANT_MODEL = "claude-opus-4-8";

/** Auto-quote only up to this subtotal (minor units). Above it → escalate. */
const AUTO_QUOTE_CAP = Number(process.env.QUOTE_AUTO_CAP_CENTS ?? 75_000); // $750
/** Events sooner than this need a human. */
const MIN_LEAD_HOURS = 48;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export const InquirySchema = z
  .object({
    message: z.string().min(1).describe("Free-text customer inquiry"),
    startDate: z.string().regex(ISO_DATE),
    // Omit for a single-day rental (endDate defaults to startDate).
    endDate: z.string().regex(ISO_DATE).optional(),
    eventType: z.string().optional(),
    guestCount: z.number().optional(),
    location: z.string().optional(),
    customerName: z.string().optional(),
    customerEmail: z.string().email().optional(),
  })
  .refine((d) => !d.endDate || d.endDate >= d.startDate, {
    message: "endDate must be on or after startDate.",
    path: ["endDate"],
  });
export type Inquiry = z.infer<typeof InquirySchema>;

// What the model returns: it maps the inquiry to catalog items. Prices are
// recomputed server-side from the DB, so the model's numbers are advisory only.
const ModelOutputSchema = z.object({
  lineItems: z.array(
    z.object({
      itemId: z.string().describe('Exact catalog item id, or "" if no match'),
      name: z.string(),
      quantity: z.number().int().positive(),
      matched: z.boolean().describe("true only if itemId is a real catalog id"),
    }),
  ),
  unmatchedRequests: z.array(z.string()).describe("Requested things not in the catalog"),
  summary: z.string().describe("Friendly, concise customer-facing reply"),
  confidence: z.enum(["high", "medium", "low"]),
  needsHuman: z.boolean(),
  escalationReason: z.string().nullable(),
});

export interface QuoteLine {
  itemId: string;
  name: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

export interface InquiryResult {
  auto: boolean;
  customerMessage: string;
  quote: {
    lineItems: QuoteLine[];
    subtotal: number;
    suggestedDeposit: number;
    currency: string;
  };
  confidence: "high" | "medium" | "low";
  escalation: { reasons: string[] } | null;
  unmatchedRequests: string[];
  bookingId: string | null;
}

function hoursUntil(dateStr: string): number {
  const event = new Date(`${dateStr}T00:00:00Z`).getTime();
  return (event - Date.now()) / 3_600_000;
}

function catalogForPrompt(items: ItemAvailability[]): string {
  return items
    .map(
      (i) =>
        `- [${i.id}] ${i.name}` +
        `${i.category ? ` (${i.category})` : ""}: ` +
        `$${(i.basePrice / 100).toFixed(2)} ${i.priceUnit}, ` +
        `${i.availability.available} available for the requested dates` +
        (i.powerRequired ? ", needs power" : ""),
    )
    .join("\n");
}

const SYSTEM_PROMPT = `You are the booking assistant for a bounce house & party rental company.
A customer sent an inquiry. Map it to the operator's catalog and reply.

Rules:
- Only quote items that appear in the catalog. Use each item's EXACT id.
- If the customer asks for something not in the catalog, put a short description in "unmatchedRequests" and DO NOT invent it as a line item.
- Set matched=true only when itemId is a real catalog id from the list.
- Set confidence="high" ONLY if you mapped every request to catalog items with no ambiguity and nothing was unmatched. Otherwise use "medium"/"low".
- Set needsHuman=true (with an escalationReason) if anything is ambiguous, unmatched, or you're unsure.
- "summary" is a warm, concise reply the customer will read. Do not state final prices there — prices are computed by the system.`;

function buildUserPrompt(
  inquiry: Inquiry,
  startDate: string,
  endDate: string,
  days: number,
  catalog: string,
): string {
  const range = startDate === endDate ? `${startDate} (1 day)` : `${startDate} to ${endDate} (${days} days)`;
  const parts = [`Customer inquiry: "${inquiry.message}"`, ``, `Rental dates: ${range}`];
  if (inquiry.eventType) parts.push(`Event type: ${inquiry.eventType}`);
  if (inquiry.guestCount != null) parts.push(`Guests: ${inquiry.guestCount}`);
  if (inquiry.location) parts.push(`Location: ${inquiry.location}`);
  parts.push(``, `Catalog (id, name, price, availability for the requested dates):`, catalog);
  return parts.join("\n");
}

/**
 * Handle a customer inquiry: quote against live inventory, apply the escalation
 * policy, and create a booking (a `quoted` draft when auto-approved, else an
 * `inquiry` draft for the operator to review).
 */
export async function handleInquiry(inquiry: Inquiry): Promise<InquiryResult> {
  const operator = await getDefaultOperator();
  if (!operator) throw new Error("No operator configured.");

  const startDate = inquiry.startDate;
  const endDate = inquiry.endDate ?? inquiry.startDate;
  const days = durationDays(startDate, endDate);

  const catalog = await availabilityForOperator(operator.id, startDate, endDate);
  const catalogById = new Map(catalog.map((i) => [i.id, i]));

  const client = getAnthropicClient();
  const response = await client.messages.parse({
    model: ASSISTANT_MODEL,
    max_tokens: 2048,
    system: SYSTEM_PROMPT,
    output_config: { format: zodOutputFormat(ModelOutputSchema) },
    messages: [
      { role: "user", content: buildUserPrompt(inquiry, startDate, endDate, days, catalogForPrompt(catalog)) },
    ],
  });
  if (response.stop_reason === "refusal") throw new Error("The assistant declined this request.");
  if (!response.parsed_output) throw new Error("Could not parse the assistant response.");
  const out = response.parsed_output;

  // Recompute the quote from authoritative catalog prices + rental duration —
  // never trust the model's numbers. Keep only lines mapping to a real item.
  const lines: QuoteLine[] = [];
  for (const li of out.lineItems) {
    const item = li.matched ? catalogById.get(li.itemId) : undefined;
    if (!item) continue;
    lines.push({
      itemId: item.id,
      name: item.name,
      quantity: li.quantity,
      unitPrice: item.basePrice,
      lineTotal: lineTotal(item.basePrice, item.priceUnit, li.quantity, days),
    });
  }
  const subtotal = lines.reduce((s, l) => s + l.lineTotal, 0);
  const suggestedDeposit = Math.round(subtotal * 0.3);

  // Deterministic escalation gate (model confidence is only one factor).
  const reasons: string[] = [];
  if (!lines.length) reasons.push("no catalog items matched");
  if (out.unmatchedRequests.length) reasons.push(`unmatched requests: ${out.unmatchedRequests.join(", ")}`);
  for (const l of lines) {
    const avail = catalogById.get(l.itemId)!.availability.available;
    if (l.quantity > avail) reasons.push(`${l.name}: ${l.quantity} requested, ${avail} available`);
  }
  if (subtotal > AUTO_QUOTE_CAP) reasons.push(`subtotal $${(subtotal / 100).toFixed(2)} over auto-quote cap $${(AUTO_QUOTE_CAP / 100).toFixed(2)}`);
  if (hoursUntil(startDate) < MIN_LEAD_HOURS) reasons.push("rental starts within 48 hours");
  if (out.confidence !== "high" || out.needsHuman) reasons.push(out.escalationReason ?? "assistant not fully confident");

  const auto = reasons.length === 0;

  // Persist a booking draft when we matched anything at all.
  let bookingId: string | null = null;
  if (lines.length) {
    const booking = await createBooking({
      operatorId: operator.id,
      startDate,
      endDate,
      customerName: inquiry.customerName ?? null,
      customerEmail: inquiry.customerEmail ?? null,
      notes: `Inquiry: ${inquiry.message}`,
      items: lines.map((l) => ({ itemId: l.itemId, quantity: l.quantity })),
    });
    // createBooking makes a `quoted` draft; downgrade to `inquiry` if escalated.
    if (!auto) await setBookingStatus(booking.id, "inquiry");
    bookingId = booking.id;
  }

  return {
    auto,
    customerMessage: auto
      ? out.summary
      : "Thanks for your inquiry! We'll confirm availability and final pricing shortly.",
    quote: { lineItems: lines, subtotal, suggestedDeposit, currency: "usd" },
    confidence: out.confidence,
    escalation: auto ? null : { reasons },
    unmatchedRequests: out.unmatchedRequests,
    bookingId,
  };
}
