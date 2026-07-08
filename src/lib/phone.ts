/**
 * Normalize a customer-entered phone to E.164 (US default) so it's ready for
 * SMS (Twilio requires E.164) and clean `tel:` links. Returns null when the
 * input can't be confidently normalized — callers keep the raw value as a
 * fallback (still fine for a human to dial).
 */
export function toE164US(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (/^\+[1-9]\d{6,14}$/.test(trimmed)) return trimmed; // already E.164
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return null;
}

/** Does this string contain at least a plausible 10-digit phone number? */
export function hasPhoneDigits(raw: string): boolean {
  return raw.replace(/\D/g, "").length >= 10;
}
