import { getSessionOperator } from "@/lib/operator/session";
import { listDocuments } from "@/lib/documents/repo";
import { contractTemplatingEnabled } from "@/lib/esign/contract-template";
import { DocumentsManager } from "@/components/operator/documents/DocumentsManager";

export const dynamic = "force-dynamic";

export default async function DocumentsPage() {
  const op = await getSessionOperator();
  if (!op) return <div className="p-8 text-ink-mute">No operator linked to your account.</div>;
  const documents = await listDocuments(op.id);
  return <DocumentsManager documents={documents} contractEditor={contractTemplatingEnabled()} />;
}
