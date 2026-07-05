// Seed the operator Inquiries inbox with real `inquiries` rows.
// Run AFTER applying supabase/migrations/0006_inquiries.sql:
//   node --env-file=.env.local scripts/seed_inquiries.mjs
import { createClient } from "@supabase/supabase-js";

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

const { data: op } = await db.from("operators").select("id").order("created_at").limit(1).single();
if (!op) throw new Error("no operator");

const { data: items } = await db
  .from("items")
  .select("id, name, base_price")
  .eq("operator_id", op.id);
const find = (part) => items.find((i) => i.name.toLowerCase().includes(part.toLowerCase()));
const r15 = find("Rainbow 15");
const r13 = find("Rainbow 13");
const jl = find("Justice League");
if (!r15 || !r13 || !jl) throw new Error("expected seed catalog (Rainbow 15/13, Justice League) not found");

const line = (it, qty = 1) => ({
  itemId: it.id,
  name: it.name,
  quantity: qty,
  unitPrice: it.base_price,
  lineTotal: it.base_price * qty,
});
const quote = (lines) => {
  const subtotal = lines.reduce((s, l) => s + l.lineTotal, 0);
  return { lineItems: lines, subtotal, suggestedDeposit: Math.round(subtotal * 0.3), currency: "usd" };
};
const minsAgo = (m) => new Date(Date.now() - m * 60_000).toISOString();

// Clear prior inbox artifacts so the seed is idempotent.
await db.from("inquiries").delete().eq("operator_id", op.id);
await db.from("bookings").delete().eq("operator_id", op.id).in("status", ["inquiry", "quoted"]);

const rows = [
  {
    operator_id: op.id,
    customer_name: "Jenna Marsh",
    customer_email: "jenna@example.com",
    customer_type: "New customer",
    location: "Plymouth, MA",
    inbound_message:
      "Hi! Is the princess bounce house available for Sat the 12th? Backyard in Plymouth, about 20 kids 🎉",
    start_date: "2026-07-12",
    end_date: "2026-07-12",
    status: "needs_review",
    auto: false,
    confidence: "medium",
    ai_summary:
      "Hi Jenna! We don't carry a princess castle, but our Rainbow 15×15 Bounce Castle is a huge hit with the kids — and it's free Sat the 12th, $190 delivered to Plymouth. Want me to hold it for you?",
    escalation_reasons: ["unmatched requests: a princess-themed bounce house (not in the catalog)"],
    unmatched_requests: ["A princess-themed bounce house"],
    quote: quote([line(r15)]),
    created_at: minsAgo(8),
  },
  {
    operator_id: op.id,
    customer_name: "Dana Cole",
    customer_email: "dana@example.com",
    customer_type: "Returning customer",
    location: "Duxbury, MA",
    inbound_message:
      "We need 3 bounce houses plus tents and generators for a school fair on Sept 6. Can you put together a package price?",
    start_date: "2026-09-06",
    end_date: "2026-09-06",
    status: "needs_review",
    auto: false,
    confidence: "low",
    ai_summary:
      "Hi Dana! A 3-unit setup with tents and generators is right up our alley. Let me confirm generator availability and put together a package price for Sept 6 — I'll follow up shortly.",
    escalation_reasons: [
      "subtotal over auto-quote cap $750",
      "unmatched requests: generators (not in the catalog)",
    ],
    unmatched_requests: ["Generators"],
    quote: quote([line(jl), line(r15), line(r13)]),
    created_at: minsAgo(60 * 20),
  },
  {
    operator_id: op.id,
    customer_name: "Tom Reyes",
    customer_email: "tom@example.com",
    customer_type: "New customer",
    location: "Plymouth, MA",
    inbound_message: "Do you have anything superhero-themed for a birthday on Jul 19?",
    start_date: "2026-07-19",
    end_date: "2026-07-19",
    status: "auto",
    auto: true,
    confidence: "high",
    ai_summary:
      "Hi Tom! Our Justice League Bounce House is perfect for a superhero birthday — it's available Jul 19 at $200 for the day, delivered. I've sent a booking link to lock it in!",
    escalation_reasons: [],
    unmatched_requests: [],
    quote: quote([line(jl)]),
    created_at: minsAgo(12),
  },
  {
    operator_id: op.id,
    customer_name: "Priya Shah",
    customer_email: "priya@example.com",
    customer_type: "New customer",
    location: "Kingston, MA",
    inbound_message: "Can you deliver to Kingston? Looking at the Rainbow 13×13 for Jul 25.",
    start_date: "2026-07-25",
    end_date: "2026-07-25",
    status: "auto",
    auto: true,
    confidence: "high",
    ai_summary:
      "Hi Priya! Yes, we deliver to Kingston. The Rainbow 13×13 Bounce Castle is $175 for the day on Jul 25 — I've sent a booking link!",
    escalation_reasons: [],
    unmatched_requests: [],
    quote: quote([line(r13)]),
    created_at: minsAgo(50),
  },
  {
    operator_id: op.id,
    customer_name: "Luis Gomez",
    customer_email: "luis@example.com",
    customer_type: "Returning customer",
    location: "Plymouth, MA",
    inbound_message: "Justice League bounce house for Aug 2?",
    start_date: "2026-08-02",
    end_date: "2026-08-02",
    status: "auto",
    auto: true,
    confidence: "high",
    ai_summary:
      "Hi Luis! The Justice League Bounce House is available Aug 2 at $200 delivered — I've sent a link to book.",
    escalation_reasons: [],
    unmatched_requests: [],
    quote: quote([line(jl)]),
    created_at: minsAgo(60 * 22),
  },
];

const { error } = await db.from("inquiries").insert(rows);
if (error) throw error;
console.log(`Seeded ${rows.length} inquiries (2 needs-review, 3 auto).`);
