import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { getAnthropicClient } from "./client";

/** Model used for quote generation. Current default per project convention. */
const QUOTE_MODEL = "claude-opus-4-8";

/** A single catalog entry the caller can supply to ground pricing. */
const CatalogItemSchema = z.object({
  name: z.string(),
  unitPrice: z.number(),
  unit: z.string().optional().describe("e.g. 'per day', 'per hour', 'flat'"),
});

/** What the caller sends to request a quote. */
export const QuoteInputSchema = z.object({
  eventType: z.string().describe("e.g. birthday party, corporate event, festival"),
  eventDate: z.string().optional(),
  durationHours: z.number().optional(),
  guestCount: z.number().optional(),
  location: z.string().optional().describe("City, ZIP, or venue"),
  items: z
    .array(z.string())
    .optional()
    .describe("Requested items, e.g. ['bounce house', 'popcorn machine']"),
  notes: z.string().optional(),
  /**
   * Optional pricing catalog. When provided, the model quotes against these
   * prices instead of estimating — keep quotes grounded and non-hallucinated.
   */
  catalog: z.array(CatalogItemSchema).optional(),
});
export type QuoteInput = z.infer<typeof QuoteInputSchema>;

const QuoteLineItemSchema = z.object({
  name: z.string(),
  quantity: z.number(),
  unitPrice: z.number(),
  lineTotal: z.number(),
});

/** The structured quote the model must return. */
export const QuoteSchema = z.object({
  lineItems: z.array(QuoteLineItemSchema),
  subtotal: z.number(),
  suggestedDeposit: z.number().describe("Recommended upfront deposit amount"),
  currency: z.string().describe("ISO currency code, e.g. USD"),
  summary: z.string().describe("A short customer-facing summary of the quote"),
  assumptions: z
    .array(z.string())
    .describe("Assumptions made where the request was ambiguous or priced by estimate"),
  upsells: z
    .array(z.string())
    .describe("Optional add-ons worth suggesting to the customer"),
});
export type Quote = z.infer<typeof QuoteSchema>;

const SYSTEM_PROMPT = `You are a quoting assistant for a bounce house and party rental company.
Given an event request, produce a clear, itemized quote.

Rules:
- If a pricing catalog is provided, quote strictly against those unit prices. Do not invent prices for catalog items.
- If no catalog is provided, produce a reasonable market estimate and record every estimated price in "assumptions".
- lineTotal must equal quantity * unitPrice for each line item, and subtotal must equal the sum of all lineTotals.
- Choose a sensible deposit (typically 20-30% of subtotal) for suggestedDeposit.
- Keep "summary" friendly and concise, suitable to paste into a customer email.
- Only suggest upsells that fit the event type and size.`;

function buildUserPrompt(input: QuoteInput): string {
  const parts: string[] = ["Generate a quote for this rental request:\n"];
  parts.push(`Event type: ${input.eventType}`);
  if (input.eventDate) parts.push(`Date: ${input.eventDate}`);
  if (input.durationHours != null) parts.push(`Duration: ${input.durationHours} hours`);
  if (input.guestCount != null) parts.push(`Guests: ${input.guestCount}`);
  if (input.location) parts.push(`Location: ${input.location}`);
  if (input.items?.length) parts.push(`Requested items: ${input.items.join(", ")}`);
  if (input.notes) parts.push(`Notes: ${input.notes}`);

  if (input.catalog?.length) {
    parts.push("\nPricing catalog (quote against these prices):");
    for (const c of input.catalog) {
      parts.push(`- ${c.name}: ${c.unitPrice}${c.unit ? ` (${c.unit})` : ""}`);
    }
  } else {
    parts.push("\nNo catalog provided — estimate prices and list each estimate in assumptions.");
  }

  return parts.join("\n");
}

/**
 * Generates a structured, Zod-validated rental quote from an event request.
 *
 * Single-call structured output — no streaming or agent loop. Throws on a
 * safety refusal or if the model output can't be parsed into a valid quote.
 */
export async function generateQuote(input: QuoteInput): Promise<Quote> {
  const client = getAnthropicClient();

  const response = await client.messages.parse({
    model: QUOTE_MODEL,
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    output_config: { format: zodOutputFormat(QuoteSchema) },
    messages: [{ role: "user", content: buildUserPrompt(input) }],
  });

  if (response.stop_reason === "refusal") {
    throw new Error("The model declined to generate a quote for this request.");
  }
  if (!response.parsed_output) {
    throw new Error("Could not parse a structured quote from the model response.");
  }

  return response.parsed_output;
}
