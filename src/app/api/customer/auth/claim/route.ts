import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { claimCustomerRecords, getCustomerAccountById, touchLastLogin } from "@/lib/customers/accounts";

export const dynamic = "force-dynamic";

/**
 * Called once, right after the browser verifies the emailed code and a session
 * cookie exists. Attaches this person's per-operator `customers` records to
 * their account.
 *
 * The email is read from the VERIFIED SESSION, never from the request body.
 * That distinction is the whole security model here: claiming binds another
 * party's rental history to the caller, so it must key off an identity the auth
 * server vouched for, not one the caller asserts. A body param would let anyone
 * claim anyone.
 *
 * Re-run on every login, not just the first — a renter who books with a NEW
 * operator gets a fresh (unclaimed) customers row, and it needs picking up too.
 * claimCustomerRecords is idempotent, so this is safe.
 */
export async function POST() {
  // getUser(), not getSession(): this revalidates the token with the auth server.
  const {
    data: { user },
  } = await createClient().auth.getUser();

  if (!user?.email) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const account = await getCustomerAccountById(user.id);
  // A signed-in auth user with no customer_accounts row is an OPERATOR user who
  // wandered in — they have a session, but not a renter identity. Refuse rather
  // than silently minting one.
  if (!account) return NextResponse.json({ error: "Not a customer account." }, { status: 403 });

  const claimed = await claimCustomerRecords(account.id, account.email);
  await touchLastLogin(account.id);
  return NextResponse.json({ ok: true, claimed });
}
