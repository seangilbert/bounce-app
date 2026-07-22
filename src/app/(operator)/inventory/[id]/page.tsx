import { notFound, redirect } from "next/navigation";
import { getSessionMembership } from "@/lib/operator/session";
import { getItem } from "@/lib/inventory/repo";
import { ItemDetail } from "@/components/operator/inventory/ItemDetail";

export const dynamic = "force-dynamic";

export default async function InventoryItemPage({ params }: { params: { id: string } }) {
  const membership = await getSessionMembership();
  if (!membership) redirect("/login");
  const op = membership.operator;

  let item;
  try {
    item = await getItem(params.id);
  } catch {
    notFound();
  }
  // Tenant-scope: never let one operator open another operator's item.
  if (!item || item.operatorId !== op.id) notFound();

  return <ItemDetail item={item} isAdmin={membership.role === "admin"} />;
}
