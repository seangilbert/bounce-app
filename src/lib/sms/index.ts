import { twilioProvider } from "./twilio";
import type { SmsProvider } from "./types";

export type { InboundSms, SmsProvider } from "./types";

/** True when Twilio credentials are present. Like email/esign, SMS degrades to a
 *  logged no-op when unset so the app runs (and deploys) without it configured. */
export function smsEnabled(): boolean {
  return !!(
    process.env.TWILIO_ACCOUNT_SID &&
    process.env.TWILIO_AUTH_TOKEN &&
    process.env.TWILIO_FROM
  );
}

export function getSmsProvider(): SmsProvider {
  return twilioProvider;
}

/** Best-effort outbound SMS. No-ops (logs) when Twilio isn't configured. */
export async function sendSms(to: string, body: string): Promise<boolean> {
  if (!smsEnabled()) {
    console.log(`[sms] disabled — would text ${to}: ${body.slice(0, 80)}`);
    return false;
  }
  try {
    await getSmsProvider().send(to, body);
    return true;
  } catch (err) {
    console.error("[sms] send failed:", err);
    return false;
  }
}
