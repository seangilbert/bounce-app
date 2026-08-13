import { sendEmail, type EmailInput } from "./send";
import { inboundReplyAddress } from "./inbound";
import type { Booking } from "@/lib/bookings/types";
import type { Operator } from "@/lib/inventory/types";

export { sendEmail } from "./send";

const money = (c: number) => `$${(c / 100).toLocaleString("en-US")}`;
const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function fmtRange(start: string, end: string): string {
  const f = (iso: string) =>
    new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      timeZone: "UTC",
    });
  return start === end ? f(start) : `${f(start)} → ${f(end)}`;
}

/** Shared on-brand email shell. */
function layout(businessName: string, heading: string, body: string): string {
  return `<!doctype html><html><body style="margin:0;padding:0;background:#FBF7F0;">
  <div style="max-width:560px;margin:0 auto;padding:28px 20px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#1A1A1A;">
    <div style="font-weight:800;font-size:18px;letter-spacing:-0.02em;">${esc(businessName)}</div>
    <div style="background:#FFFFFF;border:1px solid #F1E8DE;border-radius:20px;padding:26px;margin-top:16px;">
      <h1 style="margin:0 0 12px;font-size:22px;font-weight:800;letter-spacing:-0.02em;">${heading}</h1>
      ${body}
    </div>
    <div style="color:#9A9186;font-size:12px;margin-top:16px;text-align:center;">Sent by ${esc(businessName)} · powered by Movables</div>
  </div></body></html>`;
}

const p = (t: string) => `<p style="margin:0 0 12px;font-size:15px;line-height:1.5;color:#463F38;">${t}</p>`;

/** The brand CTA pill. `label` is raw HTML (callers may pass entities). */
const cta = (href: string, label: string) =>
  `<a href="${esc(href)}" style="display:inline-block;margin-top:14px;background:#3B7DF0;color:#fff;text-decoration:none;font-weight:700;font-size:15px;padding:12px 22px;border-radius:999px;">${label}</a>`;

/** Operator's customer-facing policies, rendered as an email footer block. */
function policiesBlock(operator: Operator): string {
  const items = [
    { label: "Cancellation policy", value: operator.cancellationPolicy },
    { label: "Damage & cleaning", value: operator.damagePolicy },
  ].filter((i) => i.value?.trim());
  if (!items.length) return "";
  return (
    `<hr style="border:none;border-top:1px solid #F1E8DE;margin:16px 0 12px;">` +
    items
      .map(
        (i) =>
          `<div style="font-weight:700;font-size:11px;letter-spacing:0.04em;text-transform:uppercase;color:#9A9186;margin-top:10px;">${esc(
            i.label,
          )}</div><div style="font-size:13px;line-height:1.5;color:#6B6259;margin-top:2px;white-space:pre-line;">${esc(
            i.value!.trim(),
          )}</div>`,
      )
      .join("")
  );
}

function lineTable(rows: { label: string; value: string; bold?: boolean }[]): string {
  return `<table style="width:100%;border-collapse:collapse;margin:8px 0;">${rows
    .map(
      (r) =>
        `<tr><td style="padding:4px 0;font-size:14px;color:${r.bold ? "#1A1A1A" : "#6B6259"};font-weight:${r.bold ? 700 : 500};">${esc(
          r.label,
        )}</td><td style="padding:4px 0;text-align:right;font-size:14px;font-weight:${r.bold ? 800 : 600};color:#1A1A1A;">${esc(
          r.value,
        )}</td></tr>`,
    )
    .join("")}</table>`;
}

/** Confirmation/receipt to the customer after a paid booking. */
export async function notifyBookingConfirmed(booking: Booking, operator: Operator, amountPaid: number) {
  const balance = booking.total - amountPaid;
  const items = booking.items.map((li) => ({
    label: `${li.quantity > 1 ? `${li.quantity}× ` : ""}${li.name}`,
    value: money(li.lineTotal),
  }));
  const hasExtras = booking.deliveryFee > 0 || booking.taxAmount > 0 || booking.discount > 0;
  const totals = [
    ...(hasExtras ? [{ label: "Subtotal", value: money(booking.subtotal) }] : []),
    ...(booking.discount > 0
      ? [{ label: `Discount${booking.promoCode ? ` (${booking.promoCode})` : ""}`, value: `−${money(booking.discount)}` }]
      : []),
    ...(booking.deliveryFee > 0 ? [{ label: "Delivery", value: money(booking.deliveryFee) }] : []),
    ...(booking.taxAmount > 0 ? [{ label: "Sales tax", value: money(booking.taxAmount) }] : []),
    { label: "Total", value: money(booking.total), bold: true },
    { label: "Paid", value: money(amountPaid) },
    ...(balance > 0 ? [{ label: "Balance due on delivery", value: money(balance) }] : []),
  ];
  const body =
    p("You're all set — your booking is confirmed. 🎉") +
    `<div style="font-weight:700;font-size:14px;color:#3B7DF0;margin:14px 0 4px;">${esc(fmtRange(booking.startDate, booking.endDate))}</div>` +
    lineTable(items) +
    `<hr style="border:none;border-top:1px solid #F1E8DE;margin:8px 0;">` +
    lineTable(totals) +
    p("You'll receive a rental agreement to e-sign shortly. We handle delivery, setup, and pickup.") +
    policiesBlock(operator);
  if (!booking.customerEmail) return;
  await sendEmail({
    to: booking.customerEmail,
    subject: `Booking confirmed — ${operator.name}`,
    html: layout(operator.name, "You're booked!", body),
    replyTo: operator.contactEmail ?? undefined,
    fromName: operator.name,
  });
}

/** A custom quote from the operator with a link for the customer to review + pay. */
export async function notifyQuoteLink(
  booking: Booking,
  operator: Operator,
  payUrl: string,
  depositAmount: number,
  message?: string,
) {
  if (!booking.customerEmail) return;
  const items = booking.items.map((li) => ({
    label: `${li.quantity > 1 ? `${li.quantity}× ` : ""}${li.name}`,
    value: money(li.lineTotal),
  }));
  const hasExtras = booking.deliveryFee > 0 || booking.taxAmount > 0 || booking.discount > 0;
  const totals = [
    ...(hasExtras ? [{ label: "Subtotal", value: money(booking.subtotal) }] : []),
    ...(booking.discount > 0
      ? [{ label: `Discount${booking.promoCode ? ` (${booking.promoCode})` : ""}`, value: `−${money(booking.discount)}` }]
      : []),
    ...(booking.deliveryFee > 0 ? [{ label: "Delivery", value: money(booking.deliveryFee) }] : []),
    ...(booking.taxAmount > 0 ? [{ label: "Sales tax", value: money(booking.taxAmount) }] : []),
    { label: "Total", value: money(booking.total), bold: true },
    ...(depositAmount > 0 ? [{ label: "Deposit to reserve", value: money(depositAmount) }] : []),
  ];
  const intro = message?.trim()
    ? p(esc(message.trim()).replace(/\n/g, "<br>"))
    : p(`Hi${booking.customerName ? ` ${esc(booking.customerName.split(/\s+/)[0]!)}` : ""} — here's your custom quote from ${esc(operator.name)}.`);
  const body =
    intro +
    `<div style="font-weight:700;font-size:14px;color:#3B7DF0;margin:14px 0 4px;">${esc(fmtRange(booking.startDate, booking.endDate))}</div>` +
    lineTable(items) +
    `<hr style="border:none;border-top:1px solid #F1E8DE;margin:8px 0;">` +
    lineTable(totals) +
    cta(payUrl, "Review &amp; reserve") +
    p(`<span style="color:#9A9186;font-size:13px;">Delivery, setup &amp; pickup included. This link holds nothing until you pay.</span>`) +
    policiesBlock(operator);
  await sendEmail({
    to: booking.customerEmail,
    subject: `Your quote from ${operator.name}`,
    html: layout(operator.name, "Your custom quote", body),
    replyTo: operator.contactEmail ?? undefined,
    fromName: operator.name,
  });
}

/** Alert to the operator that a booking was just paid. */
export async function notifyOperatorNewBooking(booking: Booking, operator: Operator, amountPaid: number) {
  if (!operator.contactEmail) return;
  const itemsLabel = booking.items.map((li) => `${li.quantity > 1 ? `${li.quantity}× ` : ""}${li.name}`).join(", ");
  const body =
    p(`<b>${esc(booking.customerName ?? "A customer")}</b> just booked and paid ${money(amountPaid)}.`) +
    lineTable([
      { label: "Date", value: fmtRange(booking.startDate, booking.endDate) },
      { label: "Items", value: itemsLabel },
      { label: "Delivery", value: booking.deliveryAddress ?? "—" },
      { label: "Contact", value: booking.customerEmail ?? "—" },
    ]);
  await sendEmail({
    to: operator.contactEmail,
    subject: `New booking — ${booking.customerName ?? "customer"}`,
    html: layout(operator.name, "New booking 💸", body),
  });
}

/** Alert to the operator that a booking's remaining balance was paid. */
export async function notifyOperatorBalancePaid(booking: Booking, operator: Operator, amountPaid: number) {
  if (!operator.contactEmail) return;
  const body =
    p(`<b>${esc(booking.customerName ?? "A customer")}</b> paid the remaining balance of ${money(amountPaid)}.`) +
    lineTable([
      { label: "Date", value: fmtRange(booking.startDate, booking.endDate) },
      { label: "Total", value: money(booking.total), bold: true },
      { label: "Paid in full", value: "Yes" },
    ]);
  await sendEmail({
    to: operator.contactEmail,
    subject: `Balance paid — ${booking.customerName ?? "customer"}`,
    html: layout(operator.name, "Balance paid ✅", body),
  });
}

/** Alert to the operator that both parties signed the rental agreement. */
export async function notifyOperatorContractSigned(booking: Booking, operator: Operator) {
  if (!operator.contactEmail) return;
  const body =
    p(`The rental agreement for <b>${esc(booking.customerName ?? "a customer")}</b> is fully signed.`) +
    lineTable([
      { label: "Date", value: fmtRange(booking.startDate, booking.endDate) },
      { label: "Contact", value: booking.customerEmail ?? "—" },
    ]);
  await sendEmail({
    to: operator.contactEmail,
    subject: `Contract signed — ${booking.customerName ?? "customer"}`,
    html: layout(operator.name, "Contract signed ✍️", body),
  });
}

/** The operator's reply, delivered to the customer. */
export async function notifyInquiryReply(opts: {
  to: string;
  businessName: string;
  operatorEmail?: string | null;
  reply: string;
  original?: string | null;
  /** When set (and inbound email is configured), the customer's email reply
   *  routes back into this inquiry's thread via the plus-addressed Reply-To. */
  inquiryId?: string;
}) {
  const body =
    p(esc(opts.reply).replace(/\n/g, "<br>")) +
    (opts.original
      ? `<div style="margin-top:16px;padding:12px 14px;background:#FBF7F0;border-radius:12px;font-size:13px;color:#6B6259;">In reply to: "${esc(
          opts.original,
        )}"</div>`
      : "");
  await sendEmail({
    to: opts.to,
    subject: `Re: your inquiry — ${opts.businessName}`,
    html: layout(opts.businessName, `A note from ${esc(opts.businessName)}`, body),
    replyTo:
      (opts.inquiryId ? inboundReplyAddress(opts.inquiryId) : null) ??
      opts.operatorEmail ??
      undefined,
    fromName: opts.businessName,
  });
}

/**
 * The AI's reply to an inbound customer email (inbox-plan Phase 1). Pure
 * builder — the webhook route sends it — so subject threading and the reply
 * loop are unit-testable. Reply-To carries the plus address so the customer's
 * next reply routes straight back to this thread.
 */
export function buildAiInquiryReplyEmail(opts: {
  to: string;
  businessName: string;
  reply: string;
  inquiryId: string;
  /** The customer's subject — threaded as "Re: <subject>" (never doubled). */
  inboundSubject?: string | null;
  /** Reply-To fallback when inbound email isn't configured. */
  operatorEmail?: string | null;
  /** Storefront CTA, appended when the AI produced a ready-to-book quote. */
  reserveUrl?: string | null;
}): EmailInput {
  const subjectBase = opts.inboundSubject?.trim();
  const subject = subjectBase
    ? /^re:/i.test(subjectBase)
      ? subjectBase
      : `Re: ${subjectBase}`
    : `Re: your inquiry — ${opts.businessName}`;
  const body =
    p(esc(opts.reply).replace(/\n/g, "<br>")) +
    (opts.reserveUrl
      ? cta(opts.reserveUrl, "Reserve online")
      : "");
  return {
    to: opts.to,
    subject,
    html: layout(opts.businessName, `A note from ${esc(opts.businessName)}`, body),
    replyTo: inboundReplyAddress(opts.inquiryId) ?? opts.operatorEmail ?? undefined,
    fromName: opts.businessName,
  };
}

/**
 * Automated balance reminder to the customer (follow-up agent, cron). Pure
 * builder — the sweep sends it and records/releases the claim on the result.
 * `intro` is the AI-drafted (or fallback) opening; every number below it is
 * rendered from the DB.
 */
export function buildBalanceReminderEmail(opts: {
  booking: Booking;
  operator: Operator;
  to: string;
  balanceCents: number;
  payUrl: string;
  intro: string;
}): EmailInput {
  const { booking, operator } = opts;
  const items = booking.items.map((li) => ({
    label: `${li.quantity > 1 ? `${li.quantity}× ` : ""}${li.name}`,
    value: money(li.lineTotal),
  }));
  const totals = [
    { label: "Total", value: money(booking.total), bold: true },
    { label: "Paid so far", value: money(booking.deposit ?? 0) },
    { label: "Balance due", value: money(opts.balanceCents), bold: true },
  ];
  const body =
    p(esc(opts.intro).replace(/\n/g, "<br>")) +
    `<div style="font-weight:700;font-size:14px;color:#3B7DF0;margin:14px 0 4px;">${esc(fmtRange(booking.startDate, booking.endDate))}</div>` +
    lineTable(items) +
    `<hr style="border:none;border-top:1px solid #F1E8DE;margin:8px 0;">` +
    lineTable(totals) +
    cta(opts.payUrl, "Pay balance") +
    p(`<span style="color:#9A9186;font-size:13px;">Secure online payment — takes about a minute.</span>`) +
    policiesBlock(operator);
  return {
    to: opts.to,
    subject: `Balance due — ${operator.name}`,
    html: layout(operator.name, "Your balance", body),
    replyTo: operator.contactEmail ?? undefined,
    fromName: operator.name,
  };
}

/**
 * Automated unsigned-contract reminder to the customer (follow-up agent,
 * cron). No CTA — the signing link only exists inside SignWell's own email,
 * which we (best-effort) re-send just before this goes out; `signwellResent`
 * flips the phrasing accordingly.
 */
export function buildContractReminderEmail(opts: {
  booking: Booking;
  operator: Operator;
  to: string;
  intro: string;
  signwellResent: boolean;
}): EmailInput {
  const { booking, operator } = opts;
  const items = booking.items.map((li) => ({
    label: `${li.quantity > 1 ? `${li.quantity}× ` : ""}${li.name}`,
    value: money(li.lineTotal),
  }));
  const body =
    p(esc(opts.intro).replace(/\n/g, "<br>")) +
    `<div style="font-weight:700;font-size:14px;color:#3B7DF0;margin:14px 0 4px;">${esc(fmtRange(booking.startDate, booking.endDate))}</div>` +
    lineTable(items) +
    p(
      opts.signwellResent
        ? "We've just re-sent your signing email from SignWell — look for it in your inbox (check spam too) and sign when you have a minute."
        : "Look for the earlier email from SignWell with your signing link — check your inbox and spam folder.",
    ) +
    policiesBlock(operator);
  return {
    to: opts.to,
    subject: `Your rental agreement is waiting — ${operator.name}`,
    html: layout(operator.name, "One signature to go", body),
    replyTo: operator.contactEmail ?? undefined,
    fromName: operator.name,
  };
}

/**
 * Automated stale-quote nudge to the customer (follow-up agent, cron). Pure
 * builder — the sweep sends it. Mirrors notifyQuoteLink's breakdown so the
 * customer sees the same numbers they were quoted; `replyTo` carries the
 * inbox plus-address when the quote came from a thread, so a reply lands
 * back in the live inbox.
 */
export function buildQuoteReminderEmail(opts: {
  booking: Booking;
  operator: Operator;
  to: string;
  payUrl: string;
  intro: string;
  replyTo?: string | null;
}): EmailInput {
  const { booking, operator } = opts;
  const items = booking.items.map((li) => ({
    label: `${li.quantity > 1 ? `${li.quantity}× ` : ""}${li.name}`,
    value: money(li.lineTotal),
  }));
  const hasExtras = booking.deliveryFee > 0 || booking.taxAmount > 0 || booking.discount > 0;
  const totals = [
    ...(hasExtras ? [{ label: "Subtotal", value: money(booking.subtotal) }] : []),
    ...(booking.discount > 0
      ? [{ label: `Discount${booking.promoCode ? ` (${booking.promoCode})` : ""}`, value: `−${money(booking.discount)}` }]
      : []),
    ...(booking.deliveryFee > 0 ? [{ label: "Delivery", value: money(booking.deliveryFee) }] : []),
    ...(booking.taxAmount > 0 ? [{ label: "Sales tax", value: money(booking.taxAmount) }] : []),
    { label: "Total", value: money(booking.total), bold: true },
  ];
  const body =
    p(esc(opts.intro).replace(/\n/g, "<br>")) +
    `<div style="font-weight:700;font-size:14px;color:#3B7DF0;margin:14px 0 4px;">${esc(fmtRange(booking.startDate, booking.endDate))}</div>` +
    lineTable(items) +
    `<hr style="border:none;border-top:1px solid #F1E8DE;margin:8px 0;">` +
    lineTable(totals) +
    cta(opts.payUrl, "Review &amp; reserve") +
    p(`<span style="color:#9A9186;font-size:13px;">Delivery, setup &amp; pickup included. This link holds nothing until you pay.</span>`) +
    policiesBlock(operator);
  return {
    to: opts.to,
    subject: `Your quote is still available — ${operator.name}`,
    html: layout(operator.name, "Still thinking it over?", body),
    replyTo: opts.replyTo ?? operator.contactEmail ?? undefined,
    fromName: operator.name,
  };
}

/**
 * Operator-facing heads-up that business documents are expired or expiring
 * soon (follow-up agent, cron). Deterministic copy — no AI: it's a utility
 * notice to the operator, not customer correspondence. Sent from Movables
 * (no fromName override), like the other operator notifications.
 */
export function buildDocExpiryEmail(opts: {
  operatorName: string;
  to: string;
  docs: { label: string; expiresAt: string; daysLeft: number }[];
  docsUrl: string;
}): EmailInput {
  const fmtDate = (iso: string) =>
    new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC",
    });
  const status = (d: { daysLeft: number }) =>
    d.daysLeft < 0
      ? `expired ${-d.daysLeft} day${d.daysLeft === -1 ? "" : "s"} ago`
      : d.daysLeft === 0
        ? "expires today"
        : `expires in ${d.daysLeft} day${d.daysLeft === 1 ? "" : "s"}`;
  const rows = opts.docs
    .map(
      (d) =>
        `<div style="padding:10px 0;border-bottom:1px solid #F1E8DE;">
          <div style="font-weight:700;font-size:14px;color:#1A1A1A;">${esc(d.label)}</div>
          <div style="font-size:13px;color:${d.daysLeft < 0 ? "#C4472E" : "#6B6259"};margin-top:2px;">${esc(
            `${status(d)} — ${fmtDate(d.expiresAt)}`,
          )}</div>
        </div>`,
    )
    .join("");
  const plural = opts.docs.length > 1;
  const body =
    p(
      `${plural ? "Some of your business documents need" : "One of your business documents needs"} attention — renew ${
        plural ? "them" : "it"
      } and upload the new version${plural ? "s" : ""} so your records stay current.`,
    ) +
    rows +
    cta(opts.docsUrl, "Review documents");
  return {
    to: opts.to,
    subject: plural
      ? `${opts.docs.length} documents expiring soon — ${opts.operatorName}`
      : `Document expiring soon — ${opts.docs[0]!.label}`,
    html: layout(opts.operatorName, plural ? "Documents expiring" : "Document expiring", body),
  };
}

/** Alert to the operator that a new inquiry needs review. */
export async function notifyOperatorNewInquiry(opts: {
  to: string;
  businessName: string;
  customer: string;
  message: string;
  link: string;
}) {
  const body =
    p(`<b>${esc(opts.customer)}</b> sent a new inquiry that needs your review:`) +
    `<div style="margin:8px 0;padding:12px 14px;background:#FBF7F0;border-radius:12px;font-size:14px;color:#463F38;">"${esc(opts.message)}"</div>` +
    `<a href="${esc(opts.link)}" style="display:inline-block;margin-top:8px;background:#3B7DF0;color:#fff;text-decoration:none;font-weight:700;font-size:14px;padding:10px 18px;border-radius:999px;">Review in your inbox</a>`;
  await sendEmail({
    to: opts.to,
    subject: `New inquiry from ${opts.customer}`,
    html: layout(opts.businessName, "New inquiry 📨", body),
  });
}
