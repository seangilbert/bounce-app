// Create OR SYNC the operator subscription products + monthly prices in Stripe,
// tagged with lookup_keys the app resolves at runtime. Idempotent: a price whose
// amount already matches is left alone; a changed amount creates a replacement
// price on the same product, moves the lookup_key to it (transfer_lookup_key),
// and archives the old price. Existing subscriptions keep the price they were
// created on — only NEW checkouts pick up the new amount.
//   node --env-file=.env.local scripts/setup_billing.mjs        (test mode)
//   node --env-file=<live env> scripts/setup_billing.mjs        (live mode)
// Amounts must mirror priceCents in src/lib/plans.ts — that file is the source
// of truth for what the marketing site advertises and signup promises.
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Annual = 2 months free (10× monthly). Yearly prices share the monthly plan's
// product, matched by name.
const PLANS = [
  { name: "Movables Solo", lookupKey: "solo_monthly", amount: 3900, interval: "month" },
  { name: "Movables Solo", lookupKey: "solo_yearly", amount: 39000, interval: "year" },
  { name: "Movables Growing", lookupKey: "growing_monthly", amount: 7900, interval: "month" },
  { name: "Movables Growing", lookupKey: "growing_yearly", amount: 79000, interval: "year" },
];

/** Reuse the product created for this plan name in an earlier loop iteration
 *  (or an earlier run), so monthly + yearly live on one product. */
async function findProductByName(name) {
  const products = await stripe.products.list({ active: true, limit: 100 });
  return products.data.find((p) => p.name === name) ?? null;
}

for (const p of PLANS) {
  const existing = await stripe.prices.list({ lookup_keys: [p.lookupKey], active: true, limit: 1 });
  const current = existing.data[0];

  if (current) {
    const productId = typeof current.product === "string" ? current.product : current.product.id;
    // Keep the product name in sync (Bounce → Movables rebrand, etc.).
    await stripe.products.update(productId, { name: p.name });

    if (current.unit_amount === p.amount && current.recurring?.interval === p.interval) {
      console.log(`✓ ${p.name}: price ${current.id} already at $${p.amount / 100}/${p.interval} (lookup_key ${p.lookupKey})`);
      continue;
    }

    // Stripe prices are immutable — replace and transfer the lookup_key.
    const price = await stripe.prices.create({
      product: productId,
      unit_amount: p.amount,
      currency: "usd",
      recurring: { interval: p.interval },
      lookup_key: p.lookupKey,
      transfer_lookup_key: true,
    });
    await stripe.prices.update(current.id, { active: false });
    console.log(
      `↻ ${p.name}: $${current.unit_amount / 100} → $${p.amount / 100}/${p.interval} (new price ${price.id}, old ${current.id} archived; existing subscriptions unaffected)`,
    );
    continue;
  }

  const product = (await findProductByName(p.name)) ?? (await stripe.products.create({ name: p.name }));
  const price = await stripe.prices.create({
    product: product.id,
    unit_amount: p.amount,
    currency: "usd",
    recurring: { interval: p.interval },
    lookup_key: p.lookupKey,
  });
  console.log(`+ ${p.name}: created price ${price.id} ($${p.amount / 100}/${p.interval}, lookup_key ${p.lookupKey})`);
}

console.log("\nDone. Prices resolve at runtime by lookup_key — no IDs needed in code.");
