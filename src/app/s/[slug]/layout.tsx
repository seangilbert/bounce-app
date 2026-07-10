import { notFound } from "next/navigation";
import { getOperatorBySlug } from "@/lib/inventory/repo";
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
  return (
    <>
      <StoreShell
        operatorId={op.id}
        slug={params.slug}
        brandColor={op.brandColor}
        operatorName={op.name}
        tagline={op.tagline}
        about={op.about}
      />
      {children}
    </>
  );
}
