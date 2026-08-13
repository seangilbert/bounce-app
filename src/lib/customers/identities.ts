import { createAdminClient } from "@/utils/supabase/admin";

/**
 * Cross-channel identity (inbox-plan Phase 2): which external handles
 * (phone / email) map to which CRM customer (channel_identities, migration
 * 0063). Written best-effort from upsertCustomer; read by the inbound webhook
 * routing fallbacks. Service-role — the writing paths (storefront, webhooks)
 * have no session.
 */

export type IdentityChannel = "sms" | "email";

/**
 * Best-effort upsert of a (customer ↔ external handle) mapping; bumps
 * last_seen_at on re-observation. On conflict the customer_id is OVERWRITTEN
 * deliberately: the newest observation of who holds a handle wins, so routing
 * follows the current holder (a recycled phone number migrates cleanly).
 * NEVER throws — an identity write must not fail a booking/inquiry flow.
 * Callers pre-normalize: lowercased email / trimmed E.164 phone (same
 * semantics as customers/repo).
 */
export async function recordChannelIdentity(
  operatorId: string,
  customerId: string,
  channel: IdentityChannel,
  externalId: string,
): Promise<void> {
  try {
    const supabase = createAdminClient();
    const { error } = await supabase.from("channel_identities").upsert(
      {
        operator_id: operatorId,
        customer_id: customerId,
        channel,
        external_id: externalId,
        last_seen_at: new Date().toISOString(),
      },
      { onConflict: "operator_id,channel,external_id" },
    );
    if (error) throw new Error(error.message);
  } catch (e) {
    console.error(`[identities] record failed (${channel}:${externalId}):`, e);
  }
}

/** Global identity lookup (shared-number model — no operator known at routing
 *  time): customers known to hold this handle, newest activity first. */
export async function findCustomersByIdentity(
  channel: IdentityChannel,
  externalId: string,
): Promise<{ customerId: string; operatorId: string }[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("channel_identities")
    .select("customer_id, operator_id")
    .eq("channel", channel)
    .eq("external_id", externalId)
    .order("last_seen_at", { ascending: false })
    .limit(20);
  if (error) throw new Error(`findCustomersByIdentity failed: ${error.message}`);
  return (data ?? []).map((r) => ({
    customerId: r.customer_id as string,
    operatorId: r.operator_id as string,
  }));
}
