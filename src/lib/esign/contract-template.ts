import { getESignatureProvider } from "./index";
import { createAdminClient } from "@/utils/supabase/admin";
import { DOCS_BUCKET } from "@/lib/documents/repo";

/**
 * Whether the self-serve embedded contract editor is configured. Requires a
 * SignWell API Application id (the embedded editor won't return an edit URL
 * without it). Off → the "Use as rental agreement" flow is hidden.
 */
export function contractTemplatingEnabled(): boolean {
  return !!process.env.SIGNWELL_API_APPLICATION_ID;
}

export interface DraftContractTemplate {
  templateId: string;
  embeddedEditUrl: string;
}

/**
 * Turn one of an operator's uploaded PDF documents into a DRAFT SignWell
 * template and return the embedded-editor URL. The operator then places signer
 * (and optional merge) fields in the iframe; on completion we persist the
 * template id as their rental agreement (see finalize action).
 */
export async function createContractTemplateFromDocument(
  operatorId: string,
  documentId: string,
  operatorName: string,
): Promise<DraftContractTemplate> {
  const apiApplicationId = process.env.SIGNWELL_API_APPLICATION_ID;
  if (!apiApplicationId)
    throw new Error("Embedded contract editing isn't configured (SIGNWELL_API_APPLICATION_ID).");

  const provider = getESignatureProvider();
  if (!provider.createDraftTemplate)
    throw new Error("The active e-signature provider doesn't support embedded templates.");

  const admin = createAdminClient();
  const { data: doc, error } = await admin
    .from("documents")
    .select("file_path, file_name, mime_type")
    .eq("id", documentId)
    .eq("operator_id", operatorId)
    .maybeSingle();
  if (error) throw new Error(`Could not load document: ${error.message}`);
  if (!doc) throw new Error("Document not found.");
  if (doc.mime_type && doc.mime_type !== "application/pdf")
    throw new Error("Only a PDF can be used as a rental agreement.");

  // Pull the file out of the private bucket and base64-encode it for SignWell.
  const { data: blob, error: dlErr } = await admin.storage.from(DOCS_BUCKET).download(doc.file_path);
  if (dlErr || !blob) throw new Error("Could not read the document file.");
  const fileBase64 = Buffer.from(await blob.arrayBuffer()).toString("base64");

  // Seed the same placeholders our send path fills. In single-signer mode only
  // the customer ("Client") signs; otherwise the operator countersigns too.
  const singleSigner = process.env.SIGNWELL_SINGLE_SIGNER === "true";
  const placeholders = singleSigner
    ? [{ id: "2", name: "Client" }]
    : [
        { id: "1", name: "Document Sender" },
        { id: "2", name: "Client" },
      ];

  const tmpl = await provider.createDraftTemplate({
    name: `${operatorName} — Rental Agreement`,
    fileName: doc.file_name ?? "rental-agreement.pdf",
    fileBase64,
    placeholders,
    apiApplicationId,
    metadata: { operator_id: operatorId, document_id: documentId },
  });

  return { templateId: tmpl.id, embeddedEditUrl: tmpl.embeddedEditUrl };
}
