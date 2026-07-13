import { notFound } from "next/navigation";
import { getOperatorBySlug } from "@/lib/inventory/repo";
import { getSessionCustomer } from "@/lib/customers/session";
import { listSavedItemIds } from "@/lib/customers/saved";
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
  const op = await getOperatorBySlug(params.slug);
  if (!op) notFound();

  const account = await getSessionCustomer();
  // Only pay for these reads when someone is actually signed in.
  const [savedItemIds, resumable] = account
    ? await Promise.all([
        listSavedItemIds(account.id, op.id),
        getResumableConversation(account.id, op.id),
      ])
    : [[] as string[], null];

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
