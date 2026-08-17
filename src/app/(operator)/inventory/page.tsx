import { getSessionMembership } from "@/lib/operator/session";
import { listItems } from "@/lib/inventory/repo";
import { planCapabilities } from "@/lib/plans";
import { InventoryManager } from "@/components/operator/inventory/InventoryManager";

export const dynamic = "force-dynamic";

export default async function InventoryPage() {
  const membership = await getSessionMembership();
  if (!membership) {
    return <div className="p-8 text-ink-mute">No operator linked to your account.</div>;
  }
  const items = await listItems(membership.operator.id); // active + inactive
  // Catalog cap as a visible runway, not just a wall at create time (the action
  // still enforces it). null = unlimited (Infinity doesn't cross the RSC boundary).
  const cap = planCapabilities(membership.operator).maxItems;
  return (
    <InventoryManager
      items={items}
      isAdmin={membership.role === "admin"}
      itemLimit={Number.isFinite(cap) ? cap : null}
    />
  );
}
