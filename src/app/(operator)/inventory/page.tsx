import { getSessionMembership } from "@/lib/operator/session";
import { listItems } from "@/lib/inventory/repo";
import { InventoryManager } from "@/components/operator/inventory/InventoryManager";

export const dynamic = "force-dynamic";

export default async function InventoryPage() {
  const membership = await getSessionMembership();
  if (!membership) {
    return <div className="p-8 text-ink-mute">No operator linked to your account.</div>;
  }
  const items = await listItems(membership.operator.id); // active + inactive
  return <InventoryManager items={items} isAdmin={membership.role === "admin"} />;
}
