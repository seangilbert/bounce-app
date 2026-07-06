import { NextResponse } from "next/server";
import { getStripeClient } from "@/lib/payments/stripe";
import { getSessionOperator } from "@/lib/operator/session";
import { createAdminClient } from "@/utils/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * Begin (or resume) Stripe Connect onboarding for the signed-in operator.
 * Creates an Express connected account if one doesn't exist, then returns a
 * hosted onboarding Account Link. On return, /connect/return refreshes status.
 */
export async function POST(req: Request) {
  const operator = await getSessionOperator();
  if (!operator) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const origin = req.headers.get("origin") ?? new URL(req.url).origin;
  const stripe = getStripeClient();

  try {
    let accountId = operator.stripeConnectId;
    if (!accountId) {
      const account = await stripe.accounts.create({
        type: "express",
        email: operator.contactEmail ?? undefined,
        business_profile: { name: operator.name },
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
        metadata: { operator_id: operator.id },
      });
      accountId = account.id;
      await createAdminClient()
        .from("operators")
        .update({ stripe_connect_id: accountId })
        .eq("id", operator.id);
    }

    const link = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: `${origin}/connect/return`,
      return_url: `${origin}/connect/return`,
      type: "account_onboarding",
    });

    return NextResponse.json({ url: link.url });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not start Stripe onboarding.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
