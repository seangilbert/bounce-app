import { redirect } from "next/navigation";
import { getStripeClient } from "@/lib/payments/stripe";
import { getSessionOperator } from "@/lib/operator/session";
import { createAdminClient } from "@/utils/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * Landing page after Stripe subscription Checkout. Confirms the subscription and
 * records it on the operator, then bounces to the dashboard. (A billing webhook
 * for ongoing lifecycle — renewals, failures, cancellations — is a follow-up;
 * this handles the signup happy path without needing one.)
 */
export default async function BillingReturnPage({
  searchParams,
}: {
  searchParams: { session_id?: string };
}) {
  const operator = await getSessionOperator();
  if (!operator) redirect("/login");
  const sessionId = searchParams.session_id;
  if (!sessionId) redirect("/dashboard");

  try {
    const stripe = getStripeClient();
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ["subscription"],
    });
    if (session.metadata?.operator_id === operator.id && session.subscription) {
      const sub =
        typeof session.subscription === "string"
          ? await stripe.subscriptions.retrieve(session.subscription)
          : session.subscription;
      const customerId =
        typeof session.customer === "string" ? session.customer : session.customer?.id ?? null;
      await createAdminClient()
        .from("operators")
        .update({
          stripe_customer_id: customerId ?? operator.stripeCustomerId,
          stripe_subscription_id: sub.id,
          subscription_status: sub.status,
        })
        .eq("id", operator.id);
    }
  } catch (err) {
    // Non-fatal: Stripe still created the subscription; a webhook can reconcile.
    console.error("[billing] return confirmation failed:", err);
  }

  redirect("/onboarding");
}
