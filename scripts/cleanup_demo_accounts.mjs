// Delete demo operator accounts created while testing sign-up.
// Removes the operator tenant (cascades items/bookings/booking_items/inquiries/
// members), its auth user(s), and best-effort Stripe test objects (customer +
// subscription, connected account).
//
//   List all operators:   node --env-file=.env.local scripts/cleanup_demo_accounts.mjs --list
//   Delete by email:      node --env-file=.env.local scripts/cleanup_demo_accounts.mjs demo+1@example.com [more@…]
//
// GUARD: refuses to delete the primary demo tenant (Bounce USA / owner@bounceusa.com).
import { createClient } from "@supabase/supabase-js";
import Stripe from "stripe";

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;

const PROTECTED_EMAILS = ["owner@bounceusa.com"];
const PROTECTED_NAMES = ["Bounce USA"];

const args = process.argv.slice(2);

if (args.length === 0 || args[0] === "--list") {
  const { data } = await db
    .from("operators")
    .select("id, name, contact_email, plan, created_at")
    .order("created_at", { ascending: true });
  console.log("Operators:");
  for (const o of data ?? []) {
    const locked = PROTECTED_NAMES.includes(o.name) || PROTECTED_EMAILS.includes(o.contact_email ?? "");
    console.log(
      `  ${locked ? "🔒" : "  "} ${(o.contact_email ?? "—").padEnd(30)} ${o.name.padEnd(20)} ${o.plan}  ${o.created_at.slice(0, 10)}`,
    );
  }
  console.log(
    args.length === 0
      ? "\nPass one or more emails to delete, e.g.: node … cleanup_demo_accounts.mjs demo+1@example.com"
      : "",
  );
  process.exit(0);
}

for (const email of args) {
  const { data: op } = await db
    .from("operators")
    .select("id, name, contact_email, stripe_customer_id, stripe_connect_id")
    .eq("contact_email", email)
    .maybeSingle();

  if (!op) {
    console.log(`- ${email}: no operator found, skipping`);
    continue;
  }
  if (PROTECTED_NAMES.includes(op.name) || PROTECTED_EMAILS.includes(op.contact_email ?? "")) {
    console.log(`- ${email}: PROTECTED (${op.name}) — refusing to delete`);
    continue;
  }

  // 1) orders have no cascade on booking_id — remove them first.
  const { data: bks } = await db.from("bookings").select("id").eq("operator_id", op.id);
  if (bks?.length) await db.from("orders").delete().in("booking_id", bks.map((b) => b.id));

  // 2) which auth users are linked (delete after the operator).
  const { data: members } = await db.from("operator_members").select("user_id").eq("operator_id", op.id);

  // 3) delete the operator — cascades items, bookings→booking_items, inquiries, members.
  const { error: opErr } = await db.from("operators").delete().eq("id", op.id);
  if (opErr) {
    console.log(`- ${email}: FAILED to delete operator: ${opErr.message}`);
    continue;
  }

  // 4) auth users.
  for (const m of members ?? []) await db.auth.admin.deleteUser(m.user_id).catch(() => {});

  // 5) Stripe test objects (best-effort).
  if (stripe) {
    if (op.stripe_customer_id) await stripe.customers.del(op.stripe_customer_id).catch(() => {});
    if (op.stripe_connect_id) await stripe.accounts.del(op.stripe_connect_id).catch(() => {});
  }

  console.log(`✓ ${email}: deleted "${op.name}" (tenant, auth user, Stripe test objects)`);
}
