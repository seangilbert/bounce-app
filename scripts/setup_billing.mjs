// Create the operator subscription products + monthly prices in Stripe (test
// mode), tagged with lookup_keys the app resolves at runtime. Idempotent.
//   node --env-file=.env.local scripts/setup_billing.mjs
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const PLANS = [
  { name: "Bounce Solo", lookupKey: "solo_monthly", amount: 2900 },
  { name: "Bounce Growing", lookupKey: "growing_monthly", amount: 5900 },
];

for (const p of PLANS) {
  // Already set up?
  const existing = await stripe.prices.list({ lookup_keys: [p.lookupKey], active: true, limit: 1 });
  if (existing.data[0]) {
    console.log(`✓ ${p.name}: price ${existing.data[0].id} (lookup_key ${p.lookupKey}) already exists`);
    continue;
  }

  const product = await stripe.products.create({ name: p.name });
  const price = await stripe.prices.create({
    product: product.id,
    unit_amount: p.amount,
    currency: "usd",
    recurring: { interval: "month" },
    lookup_key: p.lookupKey,
  });
  console.log(`+ ${p.name}: created price ${price.id} ($${p.amount / 100}/mo, lookup_key ${p.lookupKey})`);
}

console.log("\nDone. Prices resolve at runtime by lookup_key — no IDs needed in code.");
