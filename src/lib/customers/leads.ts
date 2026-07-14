import { getCustomerAccountById } from "./accounts";
import { upsertCustomer } from "./repo";

/**
 * A renter saved an item on an operator's storefront — make sure the operator
 * has a CRM record for them.
 *
 * This is the whole point of letting people sign up before they book: someone
 * hearting a water slide is a real lead, and until now the operator had no way
 * to see it. The record lands in `/customers` with source='saved' and no
 * bookings, which is what the CRM badges as a **Lead**.
 *
 * Note the asymmetry with un-saving: we do NOT delete the record when they
 * un-heart. Interest already happened, and the operator's CRM is theirs to keep
 * — the same reason a `customers` row survives a renter deleting their login.
 *
 * BEST-EFFORT by design. The save itself has already succeeded by the time this
 * runs, and it is not worth failing a heart-tap — the thing the customer can
 * see — because a CRM write hiccuped. Log and move on.
 */
export async function ensureLeadCustomer(accountId: string, operatorId: string): Promise<void> {
  try {
    const account = await getCustomerAccountById(accountId);
    // Not a renter account (an operator user browsing a storefront) — nothing to
    // record. They can still save; they just aren't a lead for anyone.
    if (!account) return;

    // `source` and `accountId` are insert-only inside upsertCustomer, so a
    // person who already booked with this operator keeps source='booking' and
    // does NOT get demoted to a lead by saving something.
    await upsertCustomer(
      operatorId,
      { email: account.email, name: account.name },
      { source: "saved", accountId },
    );
  } catch (e) {
    console.error("[customers] lead upsert on save failed:", e);
  }
}
