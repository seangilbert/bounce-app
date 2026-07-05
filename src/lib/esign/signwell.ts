import { createHmac, timingSafeEqual } from "crypto";
import type {
  CreateFromTemplateInput,
  ESignatureProvider,
  ESignDocument,
  ESignEvent,
  ESignEventType,
} from "./types";

const API_BASE = "https://www.signwell.com/api/v1";

function apiKey(): string {
  const key = process.env.SIGNWELL_API_KEY;
  if (!key) throw new Error("SIGNWELL_API_KEY is not set. Add it to .env.local.");
  return key;
}

/** Map SignWell event types onto our normalized set. */
function normalizeEventType(signwellType: string): ESignEventType {
  switch (signwellType) {
    case "document_viewed":
      return "viewed";
    case "document_signed":
      return "signed";
    case "document_completed":
      return "completed";
    case "document_declined":
      return "declined";
    case "document_expired":
      return "expired";
    case "document_canceled":
      return "canceled";
    default:
      return "unknown";
  }
}

/** Shape of the SignWell webhook body we rely on. */
interface SignWellWebhook {
  event?: { type?: string; time?: number; hash?: string };
  data?: { object?: { id?: string; status?: string; metadata?: Record<string, string> } };
}

export const signwellProvider: ESignatureProvider = {
  name: "signwell",

  async createFromTemplate(input: CreateFromTemplateInput): Promise<ESignDocument> {
    // Default to test mode everywhere except production, so dev never sends a
    // legally-binding agreement.
    const testMode = input.testMode ?? process.env.NODE_ENV !== "production";

    const body = {
      template_id: input.templateId,
      test_mode: testMode,
      draft: input.draft ?? false,
      name: input.name,
      subject: input.subject,
      message: input.message,
      recipients: input.recipients.map((r, i) => ({
        id: r.id ?? String(i + 1),
        name: r.name,
        email: r.email,
        placeholder_name: r.placeholderName,
        // SignWell rejects send_email unless embedded_signing is on; omit it so
        // recipients are emailed by default (the normal, non-embedded flow).
        ...(r.sendEmail !== undefined ? { send_email: r.sendEmail } : {}),
      })),
      template_fields: input.fields
        ? Object.entries(input.fields).map(([api_id, value]) => ({ api_id, value }))
        : undefined,
      metadata: input.metadata,
    };

    const res = await fetch(`${API_BASE}/document_templates/documents`, {
      method: "POST",
      headers: {
        "X-Api-Key": apiKey(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`SignWell create failed (${res.status}): ${detail.slice(0, 500)}`);
    }

    const doc = (await res.json()) as { id?: string; status?: string };
    if (!doc.id) throw new Error("SignWell response missing document id.");
    return { id: doc.id, status: doc.status ?? "unknown" };
  },

  async verifyWebhook(rawBody: string): Promise<ESignEvent> {
    // The signing key is the webhook's own id (from the create/list webhook
    // response), NOT the API key.
    const secret = process.env.SIGNWELL_WEBHOOK_ID;
    if (!secret) throw new Error("SIGNWELL_WEBHOOK_ID is not set.");

    let payload: SignWellWebhook;
    try {
      payload = JSON.parse(rawBody) as SignWellWebhook;
    } catch {
      throw new Error("Invalid SignWell webhook JSON.");
    }

    const evt = payload.event;
    if (!evt?.type || evt.time == null || !evt.hash) {
      throw new Error("SignWell webhook missing event type/time/hash.");
    }

    // SignWell signs the string "{type}@{time}" with HMAC-SHA256 keyed by the
    // webhook id — it does NOT sign the raw body.
    const expected = createHmac("sha256", secret)
      .update(`${evt.type}@${evt.time}`)
      .digest("hex");

    const a = Buffer.from(expected);
    const b = Buffer.from(evt.hash);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new Error("SignWell webhook signature mismatch.");
    }

    const obj = payload.data?.object;
    return {
      type: normalizeEventType(evt.type),
      documentId: obj?.id ?? "",
      status: obj?.status ?? "unknown",
      metadata: obj?.metadata ?? {},
      raw: payload,
    };
  },
};
