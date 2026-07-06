import { getSessionOperator } from "@/lib/operator/session";
import { listItems } from "@/lib/inventory/repo";
import { InventoryManager } from "@/components/operator/inventory/InventoryManager";

export const dynamic = "force-dynamic";

export default async function InventoryPage() {
  const op = await getSessionOperator();
  if (!op) {
    return <div className="p-8 text-ink-mute">No operator linked to your account.</div>;
  }
  const items = await listItems(op.id); // active + inactive
  return <InventoryManager items={items} />;
}
