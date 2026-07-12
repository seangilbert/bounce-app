import { NextResponse } from "next/server";
import { getStripeClient } from "@/lib/payments/stripe";
import { requireAdmin } from "@/lib/operator/session";
import { createAdminClient } from "@/utils/supabase/admin";
import { PLANS, TRIAL_DAYS, isPaidPlan, type PlanId } from "@/lib/plans";

export const dynamic = "force-dynamic";

/**
 * Start (or restart) a plan subscription for the signed-in operator via Stripe
 * Checkout in subscription mode, with a free trial. Reuses the operator's Stripe
 * customer if one exists. Returns the hosted checkout URL.
 */
export async function POST(req: Request) {
  const g = await requireAdmin();
  if (!g.ok) {
    return NextResponse.json({ error: g.error }, { status: 403 });
  }
  const operator = g.membership.operator;

  // An existing operator can upgrade by naming a target plan (e.g. a Free
  // operator who hit the AI-quote cap picks Solo); signup omits it and checks
  // out the plan chosen at account creation. The webhook reconciles the plan
  // from the subscription on `subscription.created`, but we also persist it now
  // so the operator's entitlement flips as soon as the trial subscription lands.
  let targetPlanId = operator.plan as PlanId;
  try {
    const body = (await req.json()) as { plan?: string } | null;
    if (body?.plan && body.plan in PLANS) targetPlanId = body.plan as PlanId;
  } catch {
    // No/invalid JSON body — fall back to the operator's current plan.
  }

  const plan = PLANS[targetPlanId];
  if (!plan || !isPaidPlan(plan.id) || !plan.stripeLookupKey) {
    return NextResponse.json({ error: "This plan doesn't require billing." }, { status: 400 });
  }
  if (targetPlanId !== operator.plan) {
    await createAdminClient().from("operators").update({ plan: targetPlanId }).eq("id", operator.id);
  }

  const origin = req.headers.get("origin") ?? new URL(req.url).origin;
  const stripe = getStripeClient();

  try {
    // Resolve the price by lookup_key (set up in scripts/setup_billing.mjs).
    const prices = await stripe.prices.list({
      lookup_keys: [plan.stripeLookupKey],
      active: true,
      limit: 1,
    });
    const price = prices.data[0];
    if (!price) {
      return NextResponse.json(
        { error: `Plan "${plan.id}" is not configured in Stripe yet.` },
        { status: 503 },
      );
    }

    // Reuse or create the operator's Stripe customer.
    let customerId = operator.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: operator.contactEmail ?? undefined,
        name: operator.name,
        metadata: { operator_id: operator.id },
      });
      customerId = customer.id;
      await createAdminClient()
        .from("operators")
        .update({ stripe_customer_id: customerId })
        .eq("id", operator.id);
    }

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: price.id, quantity: 1 }],
      subscription_data: {
        trial_period_days: TRIAL_DAYS,
        metadata: { operator_id: operator.id, plan: plan.id },
      },
      metadata: { operator_id: operator.id, plan: plan.id },
      success_url: `${origin}/billing/return?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/dashboard?billing=canceled`,
    });

    if (!session.url) throw new Error("Stripe did not return a checkout URL.");
    return NextResponse.json({ url: session.url });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Billing error.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
