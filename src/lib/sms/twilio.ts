import crypto from "node:crypto";
import type { InboundSms, SmsProvider } from "./types";

const API_BASE = "https://api.twilio.com/2010-04-01";

function creds() {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM;
  if (!sid || !token || !from) {
    throw new Error("Twilio not configured (TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_FROM).");
  }
  return { sid, token, from };
}

export const twilioProvider: SmsProvider = {
  name: "twilio",

  async send(to, body) {
    const { sid, token, from } = creds();
    const params = new URLSearchParams({ To: to, From: from, Body: body });
    const res = await fetch(`${API_BASE}/Accounts/${sid}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });
    if (!res.ok) {
      throw new Error(`Twilio send failed (${res.status}): ${await res.text()}`);
    }
    const json = (await res.json()) as { sid: string };
    return { id: json.sid };
  },

  async verifyWebhook(rawBody, headers, url) {
    const { token } = creds();
    const signature = headers.get("x-twilio-signature");
    if (!signature) throw new Error("Missing X-Twilio-Signature header.");

    // Twilio signature: base64( HMAC-SHA1( authToken, url + concat(sortedKey + value) ) ).
    const params = new URLSearchParams(rawBody);
    const sortedKeys = [...new Set(params.keys())].sort();
    let data = url;
    for (const key of sortedKeys) data += key + (params.get(key) ?? "");
    const expected = crypto.createHmac("sha1", token).update(Buffer.from(data, "utf-8")).digest("base64");

    const a = Buffer.from(signature);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      throw new Error("Invalid Twilio signature.");
    }

    return {
      from: params.get("From") ?? "",
      to: params.get("To") ?? "",
      body: params.get("Body") ?? "",
      messageSid: params.get("MessageSid") ?? "",
    };
  },
};
