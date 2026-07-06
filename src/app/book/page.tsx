import { redirect } from "next/navigation";
import { getDefaultOperator } from "@/lib/inventory/repo";

export const dynamic = "force-dynamic";

/** Legacy entry point — send to the default operator's slug-based storefront. */
export default async function BookPage() {
  const op = await getDefaultOperator();
  redirect(op?.slug ? `/s/${op.slug}` : "/s/bounce-usa");
}
