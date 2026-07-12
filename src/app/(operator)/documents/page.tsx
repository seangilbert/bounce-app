import { redirect } from "next/navigation";
import { getSessionMembership } from "@/lib/operator/session";
import { listDocuments } from "@/lib/documents/repo";
import { contractTemplatingEnabled } from "@/lib/esign/contract-template";
import { DocumentsManager } from "@/components/operator/documents/DocumentsManager";

export const dynamic = "force-dynamic";

export default async function DocumentsPage() {
  const m = await getSessionMembership();
  if (!m) return <div className="p-8 text-ink-mute">No operator linked to your account.</div>;
  if (m.role !== "admin") redirect("/dashboard"); // employees: no documents
  const documents = await listDocuments(m.operator.id);
  return <DocumentsManager documents={documents} contractEditor={contractTemplatingEnabled()} />;
}
