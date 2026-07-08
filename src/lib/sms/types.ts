/** A parsed, verified inbound SMS from the provider webhook. */
export interface InboundSms {
  /** Customer phone (E.164), the message sender. */
  from: string;
  /** Our platform number the text was sent to. */
  to: string;
  body: string;
  /** Provider message id — used for webhook idempotency. */
  messageSid: string;
}

export interface SmsProvider {
  name: string;
  /** Send an outbound SMS. Throws on provider/config error. */
  send(to: string, body: string): Promise<{ id: string }>;
  /** Verify + parse a provider webhook over the raw form body. Throws if the
   *  signature doesn't verify against `url` (the exact URL the provider POSTed). */
  verifyWebhook(rawBody: string, headers: Headers, url: string): Promise<InboundSms>;
}
