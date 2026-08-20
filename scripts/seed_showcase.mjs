// Stage realistic demo data for marketing screenshots (dev DB only):
// a delivery-day route, a repeat customer with history, follow-up agent
// activity, and AI-quote usage. Idempotent — reruns replace prior showcase rows.
//   node --env-file=.env.local scripts/seed_showcase.mjs
import { createClient } from "@supabase/supabase-js";

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

const TAG = "[showcase]";
const { data: op } = await db.from("operators").select("id").order("created_at").limit(1).single();
if (!op) throw new Error("no operator");

const { data: items } = await db.from("items").select("id, name, base_price").eq("operator_id", op.id);
const item = (part) => {
  const found = items.find((i) => i.name.toLowerCase().includes(part.toLowerCase()));
  if (!found) throw new Error(`item not found: ${part}`);
  return found;
};

// Next Saturday (at least 3 days out so nothing trips lead-time rules).
const nextSat = (() => {
  // Whole calendar days, so the "bump a week" boundary can't flap on the
  // milliseconds between runs (it did once: seed picked one Saturday, the
  // shot script's identical formula picked the other, and the route
  // screenshot captured an empty day).
  const d = new Date();
  const daysToSat = (6 - d.getDay() + 7) % 7 || 7;
  d.setDate(d.getDate() + (daysToSat < 3 ? daysToSat + 7 : daysToSat));
  // Local calendar date, not UTC — toISOString would roll past midnight.
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
})();
console.log("route day:", nextSat);

// ---- Reset prior showcase rows ---------------------------------------------
const { data: old } = await db.from("bookings").select("id").eq("operator_id", op.id).like("notes", `%${TAG}%`);
if (old?.length) await db.from("bookings").delete().in("id", old.map((b) => b.id));

const CUSTOMERS = [
  { name: "Alyssa Chen", email: "alyssa.chen@example.com", phone: "(508) 555-0117", notes: "Repeat customer — books most months. Gate code 4417, setup in the side yard past the fence.", first_seen: "2026-05-10T14:00:00Z" },
  { name: "Marcus Webb", email: "marcus.webb@example.com", phone: "(781) 555-0164" },
  { name: "Dana Whitfield", email: "dana.whitfield@example.com", phone: "(508) 555-0139" },
  { name: "Rob Castellano", email: "rob.castellano@example.com", phone: "(617) 555-0193" },
];
const custId = {};
for (const c of CUSTOMERS) {
  await db.from("customers").delete().eq("operator_id", op.id).eq("email", c.email);
  const { data, error } = await db.from("customers").insert({
    operator_id: op.id, name: c.name, email: c.email, phone: c.phone,
    notes: c.notes ?? null, source: "booking",
    first_seen: c.first_seen ?? new Date().toISOString(), last_seen: new Date().toISOString(),
  }).select("id").single();
  if (error) throw error;
  custId[c.name] = data.id;
}

// ---- Bookings ---------------------------------------------------------------
async function booking({ who, start, end = start, lines, status, window: win, address, zip, note = "" }) {
  const c = CUSTOMERS.find((x) => x.name === who);
  const li = lines.map(([part, qty]) => {
    const it = item(part);
    return { item_id: it.id, quantity: qty, unit_price: it.base_price, line_total: it.base_price * qty };
  });
  const subtotal = li.reduce((s, l) => s + l.line_total, 0);
  const fee = 2500;
  const total = subtotal + fee;
  const { data: b, error } = await db.from("bookings").insert({
    operator_id: op.id, customer_id: custId[who],
    customer_name: who, customer_email: c.email, customer_phone: c.phone,
    start_date: start, end_date: end, status,
    delivery_window: win ?? null, delivery_address: address ?? null, delivery_zip: zip ?? null,
    subtotal, delivery_fee: fee, tax_amount: 0, total, deposit: Math.round(total * 0.3),
    currency: "usd", notes: `${note} ${TAG}`.trim(),
  }).select("id").single();
  if (error) throw error;
  const { error: liErr } = await db.from("booking_items").insert(li.map((l) => ({ ...l, booking_id: b.id })));
  if (liErr) throw liErr;
  return b.id;
}

// The route day: four stops around Plymouth.
const satAlyssa = await booking({ who: "Alyssa Chen", start: nextSat, status: "paid", lines: [["Rainbow 15", 1], ["Tables", 4]], window: "8:00-10:00 AM", address: "41 Sandwich St, Plymouth, MA", zip: "02360", note: "Backyard birthday — power outlet on the deck." });
await booking({ who: "Marcus Webb", start: nextSat, status: "confirmed", lines: [["Justice League", 1]], window: "9:00-11:00 AM", address: "12 Bayberry Rd, Kingston, MA", zip: "02364" });
await booking({ who: "Dana Whitfield", start: nextSat, status: "paid", lines: [["Sponge Bob", 1], ["Tables", 8]], window: "10:00 AM-12:00 PM", address: "7 Standish Ave, Duxbury, MA", zip: "02332", note: "Church fundraiser — setup on the field." });
await booking({ who: "Rob Castellano", start: nextSat, status: "contracted", lines: [["Rainbow 13", 1]], window: "12:00-2:00 PM", address: "88 Court St, Plymouth, MA", zip: "02360" });

// Alyssa's history: three completed rentals over the summer.
const past = [];
for (const [start, lines] of [
  ["2026-05-16", [["Rainbow 15", 1]]],
  ["2026-06-20", [["Rainbow 15", 1], ["Tables", 4]]],
  ["2026-07-18", [["Justice League", 1]]],
]) {
  past.push(await booking({ who: "Alyssa Chen", start, status: "completed", lines, window: "9:00-11:00 AM", address: "41 Sandwich St, Plymouth, MA", zip: "02360" }));
}

// ---- Follow-up agent activity (send-logs) -----------------------------------
const monthsBack = (n, day = 6) => {
  const d = new Date(); d.setUTCMonth(d.getUTCMonth() - n, day); return d.toISOString();
};
const reminders = [
  { booking_id: past[0], kind: "balance", sent_at: monthsBack(3, 12) },
  { booking_id: past[1], kind: "balance", sent_at: monthsBack(2, 16) },
  { booking_id: past[2], kind: "balance", sent_at: monthsBack(1, 14) },
  { booking_id: satAlyssa, kind: "balance", sent_at: monthsBack(0, 2) },
  { booking_id: past[1], kind: "contract", sent_at: monthsBack(2, 15) },
  { booking_id: past[2], kind: "contract", sent_at: monthsBack(0, 1) },
  { booking_id: past[0], kind: "quote", sent_at: monthsBack(3, 10) },
  { booking_id: past[2], kind: "quote", sent_at: monthsBack(0, 3) },
];
const { error: remErr } = await db.from("booking_reminders").insert(
  reminders.map((r) => ({ ...r, operator_id: op.id })),
);
if (remErr) throw remErr;

// ---- Neutral display name for the demo login --------------------------------
// The operator sidebar shows the auth user's metadata name; keep it fictional
// so screenshots never carry a real person's name.
const { data: users } = await db.auth.admin.listUsers();
const demo = users.users.find((u) => u.email === "owner@bounceusa.com");
if (demo) await db.auth.admin.updateUserById(demo.id, { user_metadata: { ...demo.user_metadata, name: "Sam Rivera" } });

// ---- Agent toggles + AI-quote usage ----------------------------------------
await db.from("operators").update({ remind_balance: true, remind_contract: true, remind_quote: true }).eq("id", op.id);
const month = new Date().toISOString().slice(0, 7);
await db.from("operator_ai_usage").upsert({ operator_id: op.id, month, count: 38, updated_at: new Date().toISOString() });

console.log("showcase seeded: 4-stop route, Alyssa Chen history, reminder logs, toggles on, 38 AI quotes this month");
