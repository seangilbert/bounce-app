import { z } from "zod";

/**
 * Inbound email (inbox-plan Phase 1) — pure helpers for the plus-addressed
 * reply loop: outbound reply emails carry `Reply-To: reply+<inquiryId>@<domain>`,
 * and the Resend inbound webhook routes the customer's reply back to its
 * inquiry by parsing that address.
 *
 * Everything here is pure (env reads only) so it unit-tests without mocks.
 */

const UUID = z.string().uuid();

/** The inbound loop is live only when BOTH env vars are set (webhook secret to
 *  verify deliveries, domain to mint reply addresses). Either missing → the
 *  feature is dark: outbound reply-to falls back to the operator's contact
 *  email and the webhook no-ops. */
export function inboundEmailEnabled(): boolean {
  return !!process.env.RESEND_WEBHOOK_SECRET && !!process.env.RESEND_INBOUND_DOMAIN;
}

/** `reply+<inquiryId>@<RESEND_INBOUND_DOMAIN>`; null when the feature is off. */
export function inboundReplyAddress(inquiryId: string): string | null {
  if (!inboundEmailEnabled()) return null;
  return `reply+${inquiryId}@${process.env.RESEND_INBOUND_DOMAIN}`;
}

/** `"Jane Doe <jane@x.com>"` | `"jane@x.com"` → { email (lowercased), name }.
 *  Null when nothing address-shaped. */
export function parseEmailAddress(raw: string): { email: string; name: string | null } | null {
  const s = (raw ?? "").trim();
  if (!s) return null;
  const angled = s.match(/^(.*?)<([^<>@\s]+@[^<>\s]+)>\s*$/);
  if (angled) {
    const name = angled[1]!.trim().replace(/^"|"$/g, "").trim();
    return { email: angled[2]!.toLowerCase(), name: name || null };
  }
  const bare = s.match(/^([^<>@\s]+@[^<>\s]+)$/);
  if (bare) return { email: bare[1]!.toLowerCase(), name: null };
  return null;
}

/** Extract the inquiry UUID from one recipient address (display-name form ok):
 *  local part must be `reply+<uuid>` and the domain must be the configured
 *  inbound domain (both case-insensitive). Null otherwise. */
export function parseInboundAddress(addr: string): string | null {
  const domain = process.env.RESEND_INBOUND_DOMAIN;
  if (!domain) return null;
  const parsed = parseEmailAddress(addr);
  if (!parsed) return null;
  const [local, host] = parsed.email.split("@");
  if (!local || !host || host !== domain.toLowerCase()) return null;
  const m = local.match(/^reply\+(.+)$/);
  if (!m) return null;
  const candidate = m[1]!;
  return UUID.safeParse(candidate).success ? candidate : null;
}

/** First parseable inquiry id across the recipient lists. Callers pass them in
 *  priority order — envelope recipients (`received_for`) first, since a reply
 *  that reached us via an alias/forward may not show our address in `to`. */
export function findInquiryIdInRecipients(addrs: string[]): string | null {
  for (const addr of addrs) {
    const id = parseInboundAddress(addr);
    if (id) return id;
  }
  return null;
}

/** True for bounces / auto-replies / bulk mail — never feed these to the AI
 *  (auto-responder ↔ auto-responder loops are the classic inbound failure). */
export function isAutoResponder(headers: Record<string, string>, from: string): boolean {
  const h = new Map(Object.entries(headers ?? {}).map(([k, v]) => [k.toLowerCase(), String(v)]));
  const autoSubmitted = h.get("auto-submitted");
  if (autoSubmitted && autoSubmitted.trim().toLowerCase() !== "no") return true;
  if (h.has("x-auto-response-suppress")) return true;
  const precedence = h.get("precedence")?.trim().toLowerCase();
  if (precedence && ["bulk", "auto_reply", "junk"].includes(precedence)) return true;
  if (/mailer-daemon|no-?reply/i.test(from)) return true;
  // Self-loop guard: our own outbound sender bouncing back in.
  const self = process.env.RESEND_FROM ? parseEmailAddress(process.env.RESEND_FROM) : null;
  const sender = parseEmailAddress(from);
  if (self && sender && self.email === sender.email) return true;
  return false;
}

/** Crude but dependency-free html → text for clients that send no text part. */
function htmlToText(html: string): string {
  return html
    .replace(/<(style|script)[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|li|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n");
}

/** Markers that start a quoted reply chain — cut at the earliest one. */
const CHAIN_MARKERS = [
  /^On .+ wrote:\s*$/m, // Gmail / Apple Mail
  /^-{2,}\s*Original Message/im, // Outlook
  /^From: .+@.+$/m, // forwarded-header block
  /^_{5,}\s*$/m, // Outlook divider
];

/**
 * Strip the quoted chain + signature from an email reply so only the
 * customer's new words reach the thread and the AI. Imperfect by design —
 * unusual clients/languages fall through to the full text (the AI copes).
 */
export function extractReplyText(text: string | null, html: string | null): string {
  const source = text?.trim() ? text : html ? htmlToText(html) : "";
  if (!source.trim()) return "";

  let cutAt = source.length;
  for (const marker of CHAIN_MARKERS) {
    const m = source.match(marker);
    if (m?.index != null && m.index < cutAt) cutAt = m.index;
  }
  let out = source.slice(0, cutAt);

  // Drop a trailing "> "-quoted block (and the blank lines around it).
  const lines = out.split("\n");
  let end = lines.length;
  while (end > 0 && (lines[end - 1]!.trim() === "" || lines[end - 1]!.startsWith(">"))) end--;
  out = lines.slice(0, end).join("\n");

  // Drop a trailing signature ("-- " marker onward).
  const sig = out.match(/^--\s*$/m);
  if (sig?.index != null) out = out.slice(0, sig.index);

  out = out.trim();
  // Everything stripped (marker at the very top)? Better the full message than
  // nothing — the operator/AI sees the quoted chain, which still reads fine.
  return out || source.trim();
}
