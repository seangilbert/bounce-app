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
   * true outside production so development never sends real agreements.
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

export interface ESignatureProvider {
  readonly name: string;

  /** Create (and, unless draft, send) a document from a template. */
  createFromTemplate(input: CreateFromTemplateInput): Promise<ESignDocument>;

  /**
   * Verify a webhook against its signature and return a normalized event.
   * Throws if the signature is invalid.
   */
  verifyWebhook(rawBody: string, headers: Headers): Promise<ESignEvent>;
}
