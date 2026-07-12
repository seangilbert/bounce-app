import { redirect } from "next/navigation";
import { getSessionMembership } from "@/lib/operator/session";
import { listPromos } from "@/lib/promos/repo";
import { PromosManager } from "@/components/operator/promos/PromosManager";

export const dynamic = "force-dynamic";

export default async function PromosPage() {
  const m = await getSessionMembership();
  if (!m) return <div className="p-8 text-ink-mute">No operator linked to your account.</div>;
  if (m.role !== "admin") redirect("/dashboard"); // employees: no promos
  const promos = await listPromos(m.operator.id);
  return <PromosManager promos={promos} />;
}
