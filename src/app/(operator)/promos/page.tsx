import { getSessionOperator } from "@/lib/operator/session";
import { listPromos } from "@/lib/promos/repo";
import { PromosManager } from "@/components/operator/promos/PromosManager";

export const dynamic = "force-dynamic";

export default async function PromosPage() {
  const op = await getSessionOperator();
  if (!op) return <div className="p-8 text-ink-mute">No operator linked to your account.</div>;
  const promos = await listPromos(op.id);
  return <PromosManager promos={promos} />;
}
