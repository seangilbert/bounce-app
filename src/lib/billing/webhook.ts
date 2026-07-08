import type Stripe from "stripe";
import { createAdminClient } from "@/utils/supabase/admin";
import { PLANS, type PlanId } from "@/lib/plans";

/**
 * Operator subscription (SaaS billing) webhook handling — distinct from the
 * customer rental-payment events in the main webhook route. Keeps the
 * `operators` row's `plan` + `subscription_status` in sync with Stripe across
 * the whole lifecycle: trial → active → past_due → canceled.
 *
 * Lapse policy (product decision): when a subscription ends (deleted / unpaid /
 * canceled), the operator is **downgraded to Free** — their existing catalog is
 * grandfathered (storefront keeps working) but they can't grow it past the Free
 * cap until they re-subscribe. `past_due` keeps the paid plan during Stripe's
 * retry (grace) window; only a terminal end drops them to Free.
 */
const BILLING_EVENT_TYPES = new Set<string>([
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.payment_failed",
  "invoice.payment_succeeded",
]);

export function isBillingEvent(type: string): boolean {
  return BILLING_EVENT_TYPES.has(type);
}

/** Statuses that terminate a subscription → fall back to Free. */
const TERMINAL_STATUSES = new Set(["canceled", "unpaid", "incomplete_expired"]);
/** Statuses that still entitle the paid plan (incl. the past_due grace window). */
const ENTITLED_STATUSES = new Set(["trialing", "active", "past_due"]);

function customerIdOf(obj: { customer: string | { id: string } | null }): string | null {
  if (!obj.customer) return null;
  return typeof obj.customer === "string" ? obj.customer : obj.customer.id;
}

const PLAN_BY_LOOKUP: Record<string, PlanId> = {
  solo_monthly: "solo",
  growing_monthly: "growing",
};

/** Map a subscription's active price → our PlanId (by lookup_key, then metadata). */
function planFromSubscription(sub: Stripe.Subscription): PlanId | null {
  const lookupKey = sub.items.data[0]?.price?.lookup_key ?? null;
  const byKey = PLAN_BY_LOOKUP[lookupKey ?? ""];
  if (byKey) return byKey;
  const metaPlan = sub.metadata?.plan as PlanId | undefined;
  return metaPlan && metaPlan in PLANS ? metaPlan : null;
}

async function updateOperatorByCustomer(
  customerId: string,
  patch: Record<string, unknown>,
): Promise<boolean> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("operators")
    .update(patch)
    .eq("stripe_customer_id", customerId)
    .select("id")
    .maybeSingle();
  if (error) throw new Error(`billing: operator update failed: ${error.message}`);
  if (!data) console.warn(`[billing] no operator for stripe customer ${customerId}`);
  return !!data;
}

export async function handleBillingEvent(event: Stripe.Event): Promise<void> {
  switch (event.type) {
    case "customer.subscription.created":
    case "customer.subscription.updated": {
      const sub = event.data.object as Stripe.Subscription;
      const customerId = customerIdOf(sub);
      if (!customerId) break;
      const patch: Record<string, unknown> = {
        stripe_subscription_id: sub.id,
        subscription_status: sub.status,
      };
      const plan = planFromSubscription(sub);
      // Keep `plan` in step with the live price while entitled (handles up/downgrade);
      // if the status is terminal, drop to Free.
      if (TERMINAL_STATUSES.has(sub.status)) patch.plan = "free";
      else if (plan && ENTITLED_STATUSES.has(sub.status)) patch.plan = plan;
      await updateOperatorByCustomer(customerId, patch);
      break;
    }

    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      const customerId = customerIdOf(sub);
      if (!customerId) break;
      // Terminal end → downgrade to Free (grandfather existing items).
      await updateOperatorByCustomer(customerId, {
        subscription_status: "canceled",
        plan: "free",
      });
      break;
    }

    case "invoice.payment_failed": {
      const inv = event.data.object as Stripe.Invoice;
      const customerId = customerIdOf(inv);
      if (customerId) await updateOperatorByCustomer(customerId, { subscription_status: "past_due" });
      // (Dunning email to the operator is a follow-up.)
      break;
    }

    case "invoice.payment_succeeded": {
      const inv = event.data.object as Stripe.Invoice;
      const customerId = customerIdOf(inv);
      // A successful *renewal* (not the initial $0 trial invoice) means active.
      if (customerId && inv.billing_reason && inv.billing_reason !== "subscription_create") {
        await updateOperatorByCustomer(customerId, { subscription_status: "active" });
      }
      break;
    }
  }
}
