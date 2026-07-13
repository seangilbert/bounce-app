import { cache } from "react";
import { getSessionUser } from "@/lib/operator/session";
import { getCustomerAccountById, type CustomerAccount } from "./accounts";

/**
 * The signed-in RENTER, or null.
 *
 * The app now has two kinds of principal, and they're distinguished by which
 * table the auth user appears in:
 *
 *   operator user  →  has an `operator_members` row  (getSessionMembership)
 *   renter         →  has a `customer_accounts` row  (this)
 *
 * They're independent, not exclusive — an operator who rents from someone else
 * is legitimately both, and each surface resolves the principal it cares about.
 * A session alone means nothing; it's the row that grants access.
 *
 * `getSessionUser()` is reused deliberately: it's the one auth primitive that
 * doesn't assume operator membership (it just returns the verified user id, from
 * the middleware's trusted header when present).
 */
export const getSessionCustomer = cache(async (): Promise<CustomerAccount | null> => {
  const user = await getSessionUser();
  if (!user) return null;
  return getCustomerAccountById(user.id);
});
