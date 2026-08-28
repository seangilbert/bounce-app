import { getSessionMembership } from "@/lib/operator/session";
import { countItems } from "@/lib/inventory/repo";
import { planCapabilities } from "@/lib/plans";
import { ImportWizard } from "@/components/operator/inventory/import/ImportWizard";

export const dynamic = "force-dynamic";
// Import steps are single bounded model calls, but a retried enrich chunk can
// legitimately run ~90s — give the server actions room beyond the 60s default.
export const maxDuration = 300;

export default async function InventoryImportPage() {
  const membership = await getSessionMembership();
  if (!membership) {
    return <div className="p-8 text-ink-mute">No operator linked to your account.</div>;
  }
  if (membership.role !== "admin") {
    return <div className="p-8 text-ink-mute">Only admins can import inventory.</div>;
  }
  const liveNow = await countItems(membership.operator.id, { activeOnly: true });
  const cap = planCapabilities(membership.operator).maxItems;
  return <ImportWizard liveNow={liveNow} itemLimit={Number.isFinite(cap) ? cap : null} />;
}
