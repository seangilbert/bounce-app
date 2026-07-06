import { redirect } from "next/navigation";
import { getStripeClient } from "@/lib/payments/stripe";
import { getSessionOperator } from "@/lib/operator/session";
import { createAdminClient } from "@/utils/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * Landing page after Stripe Connect onboarding. Refreshes whether charges are
 * enabled on the operator's connected account, records it, and returns to the
 * dashboard. (An account.updated webhook for later status changes — e.g. Stripe
 * enabling charges after review — is a follow-up.)
 */
export default async function ConnectReturnPage() {
  const operator = await getSessionOperator();
  if (!operator) redirect("/login");

  if (operator.stripeConnectId) {
    try {
      const account = await getStripeClient().accounts.retrieve(operator.stripeConnectId);
      await createAdminClient()
        .from("operators")
        .update({ connect_charges_enabled: account.charges_enabled ?? false })
        .eq("id", operator.id);
    } catch (err) {
      console.error("[connect] return refresh failed:", err);
    }
  }

  redirect("/dashboard?payments=connected");
}
