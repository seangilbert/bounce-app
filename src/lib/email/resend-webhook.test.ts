import { describe, it, expect, beforeEach, vi } from "vitest";
import { createHmac } from "node:crypto";
import { verifyResendWebhook } from "./resend-webhook";

/** Real HMACs against a fixed test secret — no mocked crypto. */
const SECRET_B64 = Buffer.from("test-signing-key").toString("base64");
const SECRET = `whsec_${SECRET_B64}`;
const NOW_MS = 1_760_000_000_000; // fixed clock injected via nowMs

const PAYLOAD = JSON.stringify({
  type: "email.received",
  data: { email_id: "em_123", from: "jane@example.com", to: ["reply+x@inbox.movables.ai"] },
});

function sign(body: string, id: string, tsSec: number, secret = SECRET): string {
  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  return createHmac("sha256", key).update(`${id}.${tsSec}.${body}`).digest("base64");
}

function makeHeaders(over: Record<string, string | null> = {}): Headers {
  const tsSec = Math.floor(NOW_MS / 1000);
  const base: Record<string, string> = {
    "svix-id": "msg_1",
    "svix-timestamp": String(tsSec),
    "svix-signature": `v1,${sign(PAYLOAD, "msg_1", tsSec)}`,
  };
  const h = new Headers();
  for (const [k, v] of Object.entries({ ...base, ...over })) {
    if (v !== null) h.set(k, v);
  }
  return h;
}

beforeEach(() => {
  vi.unstubAllEnvs();
  vi.stubEnv("RESEND_WEBHOOK_SECRET", SECRET);
});

describe("verifyResendWebhook", () => {
  it("accepts a valid signature and returns the parsed payload", () => {
    const event = verifyResendWebhook(PAYLOAD, makeHeaders(), NOW_MS);
    expect(event.type).toBe("email.received");
    expect(event.data.email_id).toBe("em_123");
  });

  it("rejects a tampered body", () => {
    expect(() =>
      verifyResendWebhook(PAYLOAD.replace("jane", "eve"), makeHeaders(), NOW_MS),
    ).toThrow(/signature mismatch/);
  });

  it("rejects a signature made with the wrong secret", () => {
    const tsSec = Math.floor(NOW_MS / 1000);
    const bad = sign(PAYLOAD, "msg_1", tsSec, `whsec_${Buffer.from("other-key").toString("base64")}`);
    expect(() =>
      verifyResendWebhook(PAYLOAD, makeHeaders({ "svix-signature": `v1,${bad}` }), NOW_MS),
    ).toThrow(/signature mismatch/);
  });

  it("rejects stale and future timestamps (±5 min)", () => {
    const staleSec = Math.floor(NOW_MS / 1000) - 600;
    const stale = makeHeaders({
      "svix-timestamp": String(staleSec),
      "svix-signature": `v1,${sign(PAYLOAD, "msg_1", staleSec)}`, // correctly signed, but old
    });
    expect(() => verifyResendWebhook(PAYLOAD, stale, NOW_MS)).toThrow(/tolerance/);

    const futureSec = Math.floor(NOW_MS / 1000) + 600;
    const future = makeHeaders({
      "svix-timestamp": String(futureSec),
      "svix-signature": `v1,${sign(PAYLOAD, "msg_1", futureSec)}`,
    });
    expect(() => verifyResendWebhook(PAYLOAD, future, NOW_MS)).toThrow(/tolerance/);
  });

  it("accepts a multi-signature header when any entry matches (key rotation)", () => {
    const tsSec = Math.floor(NOW_MS / 1000);
    const good = sign(PAYLOAD, "msg_1", tsSec);
    const bad = Buffer.from("x".repeat(32)).toString("base64");
    const h = makeHeaders({ "svix-signature": `v1,${bad} v1,${good}` });
    expect(verifyResendWebhook(PAYLOAD, h, NOW_MS).type).toBe("email.received");
    const allBad = makeHeaders({ "svix-signature": `v1,${bad} v1,${bad}` });
    expect(() => verifyResendWebhook(PAYLOAD, allBad, NOW_MS)).toThrow(/mismatch/);
  });

  it("rejects when any svix header is missing, or the secret env is unset", () => {
    expect(() => verifyResendWebhook(PAYLOAD, makeHeaders({ "svix-id": null }), NOW_MS)).toThrow(
      /Missing svix/,
    );
    vi.stubEnv("RESEND_WEBHOOK_SECRET", "");
    expect(() => verifyResendWebhook(PAYLOAD, makeHeaders(), NOW_MS)).toThrow(/not set/);
  });
});
