import { notFound } from "next/navigation";
import { getOperatorBySlug } from "@/lib/inventory/repo";
import { Storefront } from "@/components/store/Storefront";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: { slug: string } }) {
  const op = await getOperatorBySlug(params.slug);
  return {
    title: op ? `Book — ${op.name}` : "Storefront",
    description: op ? `Rent from ${op.name} — delivered and set up.` : undefined,
  };
}

/** A single operator's public storefront, scoped to their catalog + payments. */
export default async function StorefrontPage({ params }: { params: { slug: string } }) {
  const op = await getOperatorBySlug(params.slug);
  if (!op) notFound();
  return <Storefront operatorId={op.id} brandColor={op.brandColor} />;
}
