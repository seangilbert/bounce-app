import { notFound } from "next/navigation";
import { getOperatorBySlug } from "@/lib/inventory/repo";
import { getSessionUser } from "@/lib/operator/session";
import { getCustomerAccountById } from "@/lib/customers/accounts";
import { listSavedItemIdsBySlug } from "@/lib/customers/saved";
import { getResumableConversation } from "@/lib/customers/conversations";
import { StoreShell } from "@/components/store/Storefront";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: { slug: string } }) {
  const op = await getOperatorBySlug(params.slug);
  return {
    title: op ? `Book — ${op.name}` : "Storefront",
    description: op ? op.tagline ?? `Rent from ${op.name} — delivered and set up.` : undefined,
  };
}

/**
 * Storefront shell. The nav (Chat / Inventory / Saved / Inspiration) uses real
 * routes, but the shell is rendered here in the layout — which stays mounted
 * across those child routes — so the live chat, cart, and checkout state
 * survive navigation. Each child page is just a route marker; the shell picks
 * the active view from the pathname.
 *
 * The storefront is public but SESSION-AWARE: when the visitor is a signed-in
 * renter we resolve them here (server-side) and hand the shell their saved items
 * plus any conversation worth resuming. Guests get nulls and exactly the guest
 * experience they had before — nothing about browsing or booking needs an
 * account.
 */
export default async function StoreLayout({
  params,
  children,
}: {
  params: { slug: string };
  children: React.ReactNode;
}) {
  // Every Supabase call crosses a region boundary (~120ms), so what matters here
  // is the DEPTH of the query graph, not its width. These four are independent
  // and run concurrently — one round-trip of latency, not four.
  //
  // The trick that makes them independent: `customer_accounts.id` IS the auth
  // user id (migration 0046), and the saved/conversation lookups take the SLUG
  // rather than an operator id. So nothing has to wait for the account row or
  // the operator row to load first. Sequentially this was ~610ms; in parallel
  // it's ~125ms.
  //
  // `getSessionUser()` is free — the middleware already verified the token and
  // forwarded the id in a trusted header.
  const user = await getSessionUser();

  const [op, account, savedItemIds, resumable] = await Promise.all([
    getOperatorBySlug(params.slug),
    // Guests skip all three customer reads entirely — the public funnel pays
    // nothing for a feature it doesn't use.
    user ? getCustomerAccountById(user.id) : null,
    user ? listSavedItemIdsBySlug(user.id, params.slug) : ([] as string[]),
    user ? getResumableConversation(user.id, params.slug) : null,
  ]);

  if (!op) notFound();

  return (
    <>
      <StoreShell
        operatorId={op.id}
        slug={params.slug}
        brandColor={op.brandColor}
        operatorName={op.name}
        logoUrl={op.logoUrl}
        tagline={op.tagline}
        about={op.about}
        customer={account ? { name: account.name, email: account.email } : null}
        savedItemIds={savedItemIds}
        resumable={resumable}
      />
      {children}
    </>
  );
}
