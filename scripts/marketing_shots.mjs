// Capture real-product screenshots for the /features marketing slots.
// Runs against the local dev server + dev DB demo operator:
//   node --env-file=.env.local scripts/marketing_shots.mjs
// Writes PNGs (2x for retina) to public/marketing/.
import puppeteer from "puppeteer-core";
import { createClient } from "@supabase/supabase-js";
import { mkdirSync } from "node:fs";

const BASE = process.env.SHOT_BASE ?? "http://localhost:3000";
const EMAIL = process.env.OPERATOR_EMAIL ?? "owner@bounceusa.com";
const PASSWORD = process.env.OPERATOR_PASSWORD ?? "bounce-usa-demo";
const OUT = "public/marketing";
mkdirSync(OUT, { recursive: true });

// Shoot under the fictional storefront brand (matches the homepage demo),
// then restore the operator's real name/logo whatever happens.
const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);
const { data: opRow } = await db
  .from("operators").select("id, name, logo_url").order("created_at").limit(1).single();
await db.from("operators")
  .update({ name: "Sunny Rentals", logo_url: null })
  .eq("id", opRow.id);

const browser = await puppeteer.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: "new",
});
try {

const page = await browser.newPage();
await page.evaluateOnNewDocument(() => {
  try { localStorage.setItem("bounce.cookie-notice.v1", "dismissed"); } catch {}
});
const view = (w, h) => page.setViewport({ width: w, height: h, deviceScaleFactor: 2 });
const settle = (ms = 900) => new Promise((r) => setTimeout(r, ms));
const shot = async (name) => {
  await settle();
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log(`✓ ${name}`);
};

// ---- Log in ----------------------------------------------------------------
await view(1280, 900);
await page.goto(`${BASE}/login`, { waitUntil: "networkidle2" });
await page.type('input[type="email"]', EMAIL);
await page.type('input[type="password"]', PASSWORD);
await Promise.all([
  page.waitForNavigation({ waitUntil: "networkidle2", timeout: 30000 }),
  page.click('button[type="submit"]'),
]);
console.log("logged in →", page.url());

// ---- Inbox: list + thread --------------------------------------------------
await view(1440, 800);
await page.goto(`${BASE}/inquiries`, { waitUntil: "networkidle2" });
// Open the first inquiry so the thread pane shows alongside the list.
const row = await page.$('a[href*="/inquiries/"], [data-inquiry], main li a, main a');
if (row) { await row.click(); await settle(1200); }
await shot("inbox");

// ---- Agents ----------------------------------------------------------------
await view(1000, 760);
await page.goto(`${BASE}/agents`, { waitUntil: "networkidle2" });
await shot("agents");

// ---- Route sheet on a phone (whatever day the showcase seed staged) --------
// Ask the DB rather than re-deriving "next Saturday": duplicating the date
// math once put the seed and the camera on different Saturdays and shipped
// an empty route screenshot.
const { data: routeBooking } = await db
  .from("bookings")
  .select("start_date")
  .eq("operator_id", opRow.id)
  .like("notes", "%[showcase]%")
  .gte("start_date", new Date().toISOString().slice(0, 10))
  .order("start_date")
  .limit(1)
  .single();
if (!routeBooking) throw new Error("no upcoming showcase bookings — run seed_showcase.mjs first");
await view(420, 860);
await page.goto(`${BASE}/deliveries?d=${routeBooking.start_date}`, { waitUntil: "networkidle2" });
// Real stop cards, not the empty state.
await page.waitForFunction(() => document.body.innerText.includes("Mark delivered"), { timeout: 15000 });
await shot("routes");

// ---- Customer profile ------------------------------------------------------
await view(1100, 720);
await page.goto(`${BASE}/customers`, { waitUntil: "networkidle2" });
const alyssaHref = await page.evaluate(() => {
  const a = [...document.querySelectorAll('a[href*="/customers/"]')]
    .find((n) => n.textContent.includes("Alyssa"));
  return a?.getAttribute("href") ?? null;
});
if (alyssaHref) {
  await page.goto(`${BASE}${alyssaHref}`, { waitUntil: "networkidle2" });
  await shot("customer");
} else {
  console.log("✗ customer: Alyssa Chen not found in list");
}

// ---- Storefront catalog (public) ------------------------------------------
await view(1200, 800);
await page.goto(`${BASE}/s/bounce-usa`, { waitUntil: "networkidle2" });
// The catalog hydrates after load — wait for real cards, then their photos.
await page.waitForFunction(() => document.body.innerText.includes("View details"), { timeout: 20000 });
await page.waitForFunction(() => [...document.images].every((i) => i.complete), { timeout: 15000 }).catch(() => {});
await settle(800);
await shot("storefront");

// ---- Storefront chat with a live AI quote ----------------------------------
await view(900, 1020);
await page.goto(`${BASE}/s/bounce-usa`, { waitUntil: "networkidle2" });
try {
  const input = await page.waitForSelector('input[placeholder^="e.g."]', { timeout: 8000 });
  await input.type("Is the Rainbow 15x15 bounce castle available Saturday, Sep 5? Backyard birthday party in Plymouth 02360");
  await page.keyboard.press("Enter");
  // Wait for a priced quote card to render (dollar amount in the reply).
  await page.waitForFunction(
    () => document.body.innerText.includes("Total"),
    { timeout: 60000 },
  );
  // Center the quote card so message, reply, and the book button all fit.
  await page.evaluate(() => {
    const el = [...document.querySelectorAll("span, div")].reverse()
      .find((n) => n.childElementCount === 0 && n.textContent.trim() === "Total");
    el?.scrollIntoView({ block: "center" });
  });
  await settle(600);
  await shot("quote-chat");
} catch (e) {
  await shot("quote-chat-debug");
  console.log("✗ quote-chat (debug shot saved):", e.message.split("\n")[0]);
}


} finally {
  await browser.close().catch(() => {});
  await db.from("operators").update({ name: opRow.name, logo_url: opRow.logo_url }).eq("id", opRow.id);
  console.log(`operator restored to "${opRow.name}"`);
}
