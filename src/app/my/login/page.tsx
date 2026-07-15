import { redirect } from "next/navigation";
import { getSessionCustomer } from "@/lib/customers/session";
import { safeNext } from "@/lib/customers/redirect";
import { CustomerLogin } from "@/components/customer/CustomerLogin";

export const dynamic = "force-dynamic";

export const metadata = { title: "Sign in — Movables" };

/**
 * The "already signed in?" check the middleware deliberately doesn't do (it
 * can't tell an operator session from a renter session at the edge without a DB
 * read — see utils/supabase/middleware.ts).
 *
 * Only a RENTER gets bounced to the portal. An operator who lands here keeps the
 * login form, because /my would just gate them straight back and loop.
 */
export default async function CustomerLoginPage({
  searchParams,
}: {
  searchParams: { next?: string };
}) {
  const next = safeNext(searchParams.next);
  if (await getSessionCustomer()) redirect(next);
  return <CustomerLogin next={next} />;
}
