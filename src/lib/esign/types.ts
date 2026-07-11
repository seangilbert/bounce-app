/**
 * Provider-agnostic e-signature types.
 *
 * Business logic depends only on these — never on SignWell directly — so the
 * active e-sign provider can be swapped via the ESIGN_PROVIDER env var, the
 * same pattern as src/lib/payments.
 */

export interface ESignRecipient {
  /** Stable id for this recipient within the request (defaults to index). */
  id?: string;
  name: string;
  email: string;
  /** Template placeholder/role this recipient fills, e.g. "Client". */
  placeholderName?: string;
  /** Whether the provider emails this recipient a signing link. */
  sendEmail?: boolean;
}

export interface CreateFromTemplateInput {
  /** Provider template id to generate the document from. */
  templateId: string;
  name?: string;
  subject?: string;
  message?: string;
  recipients: ESignRecipient[];
  /** Template field values, keyed by the field's api_id. */
  fields?: Record<string, string | number | boolean>;
  /** Echoed back on webhook events — use it to link the document to an order. */
  metadata?: Record<string, string>;
  /** Create as a draft (not sent) when true. */
  draft?: boolean;
  /**
   * Test-mode document (no legal weight, not counted for billing). Defaults to
   * true — going live is always an explicit opt-in, never implicit.
   */
  testMode?: boolean;
}

export interface ESignDocument {
  /** Provider-native document id. */
  id: string;
  /** Provider-native status string, e.g. "Sent", "Completed". */
  status: string;
}

/** Normalized webhook event kinds we care about across providers. */
export type ESignEventType =
  | "viewed"
  | "signed"
  | "completed"
  | "declined"
  | "expired"
  | "canceled"
  | "unknown";

export interface ESignEvent {
  type: ESignEventType;
  /** Provider document id the event is about. */
  documentId: string;
  /** Provider-native document status at the time of the event. */
  status: string;
  /** Metadata set at creation time (e.g. `{ order_id }`). */
  metadata: Record<string, string>;
  /** The provider-native payload, for handlers needing full detail. */
  raw: unknown;
}

export interface CreateDraftTemplateInput {
  /** Template name shown in the provider dashboard. */
  name: string;
  /** Original file name including extension (e.g. "agreement.pdf"). */
  fileName: string;
  /** Base64-encoded file bytes (no `data:` prefix). */
  fileBase64: string;
  /** Signing roles to pre-seed, e.g. `[{ id: "2", name: "Client" }]`. */
  placeholders: { id: string; name: string }[];
  /** Provider API-application id — required to return an embedded editor URL. */
  apiApplicationId: string;
  metadata?: Record<string, string>;
}

export interface DraftTemplate {
  /** Provider template id — becomes the operator's rental-agreement template. */
  id: string;
  /** URL to load in an iframe so the user visually places signer/merge fields. */
  embeddedEditUrl: string;
  status: string;
}

export interface ESignatureProvider {
  readonly name: string;

  /** Create (and, unless draft, send) a document from a template. */
  createFromTemplate(input: CreateFromTemplateInput): Promise<ESignDocument>;

  /**
   * Create a DRAFT reusable template from an uploaded file, returning an
   * embedded-editor URL where the user places signer/merge fields. Optional —
   * providers without embedded template editing may omit it.
   */
  createDraftTemplate?(input: CreateDraftTemplateInput): Promise<DraftTemplate>;

  /**
   * Verify a webhook against its signature and return a normalized event.
   * Throws if the signature is invalid.
   */
  verifyWebhook(rawBody: string, headers: Headers): Promise<ESignEvent>;
}
