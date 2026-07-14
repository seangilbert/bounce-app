import { createAdminClient } from "@/utils/supabase/admin";

/** The platform-level identity of a person who rents (see migration 0046). */
export interface CustomerAccount {
  id: string;
  email: string;
  name: string | null;
  createdAt: string;
  lastLoginAt: string | null;
}

interface AccountRow {
  id: string;
  email: string;
  name: string | null;
  created_at: string;
  last_login_at: string | null;
}

const rowToAccount = (r: AccountRow): CustomerAccount => ({
  id: r.id,
  email: r.email,
  name: r.name,
  createdAt: r.created_at,
  lastLoginAt: r.last_login_at,
});

/** Emails are identity here — always compare lowercased + trimmed. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}


export async function getCustomerAccountById(userId: string): Promise<CustomerAccount | null> {
  const { data } = await createAdminClient()
    .from("customer_accounts")
    .select("id, email, name, created_at, last_login_at")
    .eq("id", userId)
    .maybeSingle();
  return data ? rowToAccount(data as AccountRow) : null;
}

/**
 * Find-or-create the auth user + `customer_accounts` row for a verified-by-us
 * email, returning the auth user id.
 *
 * Signing up and signing in are the same call now (see lib/customers/otp.ts),
 * so this is reached for an address nobody has ever seen before.
 *
 * The auth user may already exist for a reason that has nothing to do with the
 * portal: this person could be an OPERATOR who also rents from someone else. In
 * that case we reuse their existing login and just add the customer_accounts
 * row — the two principals coexist (see migration 0046).
 */
export async function ensureCustomerAccount(
  email: string,
  name?: string | null,
): Promise<{ ok: true; userId: string } | { ok: false; error: string }> {
  const supabase = createAdminClient();
  const normalized = normalizeEmail(email);

  const existing = await supabase
    .from("customer_accounts")
    .select("id")
    .eq("email", normalized)
    .maybeSingle();
  if (existing.data?.id) return { ok: true, userId: existing.data.id as string };

  // No account row yet. There may still be an auth user (an operator who rents),
  // so create-then-fall-back rather than assuming.
  let userId: string | null = null;
  const created = await supabase.auth.admin.createUser({
    email: normalized,
    email_confirm: true, // they prove ownership by entering the emailed code
    user_metadata: name ? { name } : undefined,
  });
  if (created.data?.user) {
    userId = created.data.user.id;
  } else {
    // Almost certainly "email already registered" — find the existing user.
    const found = await findAuthUserByEmail(normalized);
    if (!found) {
      console.error("[customer-auth] could not create or find auth user:", created.error);
      return { ok: false, error: "Could not start a sign-in for that email." };
    }
    userId = found;
  }

  const { error } = await supabase
    .from("customer_accounts")
    .insert({ id: userId, email: normalized, name: name?.trim() || null });
  // A concurrent request may have inserted it first — that's a success, not a failure.
  if (error && !isUniqueViolation(error)) {
    console.error("[customer-auth] could not create customer_accounts row:", error);
    return { ok: false, error: "Could not start a sign-in for that email." };
  }
  return { ok: true, userId };
}

function isUniqueViolation(error: { code?: string }): boolean {
  return error.code === "23505";
}

/** Page through auth users to find one by email (no direct get-by-email API). */
async function findAuthUserByEmail(email: string): Promise<string | null> {
  const supabase = createAdminClient();
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error || !data?.users?.length) return null;
    const hit = data.users.find((u) => u.email?.toLowerCase() === email);
    if (hit) return hit.id;
    if (data.users.length < 200) return null;
  }
  return null;
}

/**
 * Claim every per-operator `customers` record matching this account's verified
 * email — this is what turns "rows scattered across operators" into "my
 * bookings".
 *
 * MUST only be called with an email the caller has actually PROVEN they own (a
 * verified session), never one taken from a request body: claiming attaches
 * another person's rental history to the caller's account.
 *
 * Idempotent, and safe to re-run on every login — that's deliberate, because a
 * customer can rent from a NEW operator after their account exists, and that
 * fresh record needs claiming too.
 */
export async function claimCustomerRecords(accountId: string, verifiedEmail: string): Promise<number> {
  const { data, error } = await createAdminClient()
    .from("customers")
    .update({ account_id: accountId })
    .eq("email", normalizeEmail(verifiedEmail))
    .is("account_id", null)
    .select("id");
  if (error) {
    console.error("[customer-auth] claim failed:", error);
    return 0;
  }
  return (data ?? []).length;
}

export async function touchLastLogin(accountId: string): Promise<void> {
  await createAdminClient()
    .from("customer_accounts")
    .update({ last_login_at: new Date().toISOString() })
    .eq("id", accountId);
}
