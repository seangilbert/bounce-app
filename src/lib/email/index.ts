import { sendEmail } from "./send";
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
    <div style="color:#9A9186;font-size:12px;margin-top:16px;text-align:center;">Sent by ${esc(businessName)} · powered by Bounce</div>
  </div></body></html>`;
}

const p = (t: string) => `<p style="margin:0 0 12px;font-size:15px;line-height:1.5;color:#463F38;">${t}</p>`;

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
  const hasExtras = booking.deliveryFee > 0 || booking.taxAmount > 0;
  const totals = [
    ...(hasExtras ? [{ label: "Subtotal", value: money(booking.subtotal) }] : []),
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
    p("You'll receive a rental agreement to e-sign shortly. We handle delivery, setup, and pickup.");
  if (!booking.customerEmail) return;
  await sendEmail({
    to: booking.customerEmail,
    subject: `Booking confirmed — ${operator.name}`,
    html: layout(operator.name, "You're booked!", body),
    replyTo: operator.contactEmail ?? undefined,
  });
}

/** A custom quote from the operator with a link for the customer to review + pay. */
export async function notifyQuoteLink(booking: Booking, operator: Operator, payUrl: string, depositAmount: number) {
  if (!booking.customerEmail) return;
  const items = booking.items.map((li) => ({
    label: `${li.quantity > 1 ? `${li.quantity}× ` : ""}${li.name}`,
    value: money(li.lineTotal),
  }));
  const hasExtras = booking.deliveryFee > 0 || booking.taxAmount > 0;
  const totals = [
    ...(hasExtras ? [{ label: "Subtotal", value: money(booking.subtotal) }] : []),
    ...(booking.deliveryFee > 0 ? [{ label: "Delivery", value: money(booking.deliveryFee) }] : []),
    ...(booking.taxAmount > 0 ? [{ label: "Sales tax", value: money(booking.taxAmount) }] : []),
    { label: "Total", value: money(booking.total), bold: true },
    ...(depositAmount > 0 ? [{ label: "Deposit to reserve", value: money(depositAmount) }] : []),
  ];
  const body =
    p(`Hi${booking.customerName ? ` ${esc(booking.customerName.split(/\s+/)[0]!)}` : ""} — here's your custom quote from ${esc(operator.name)}.`) +
    `<div style="font-weight:700;font-size:14px;color:#3B7DF0;margin:14px 0 4px;">${esc(fmtRange(booking.startDate, booking.endDate))}</div>` +
    lineTable(items) +
    `<hr style="border:none;border-top:1px solid #F1E8DE;margin:8px 0;">` +
    lineTable(totals) +
    `<a href="${esc(payUrl)}" style="display:inline-block;margin-top:14px;background:#3B7DF0;color:#fff;text-decoration:none;font-weight:700;font-size:15px;padding:12px 22px;border-radius:999px;">Review &amp; reserve</a>` +
    p(`<span style="color:#9A9186;font-size:13px;">Delivery, setup &amp; pickup included. This link holds nothing until you pay.</span>`);
  await sendEmail({
    to: booking.customerEmail,
    subject: `Your quote from ${operator.name}`,
    html: layout(operator.name, "Your custom quote", body),
    replyTo: operator.contactEmail ?? undefined,
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

/** The operator's reply, delivered to the customer. */
export async function notifyInquiryReply(opts: {
  to: string;
  businessName: string;
  operatorEmail?: string | null;
  reply: string;
  original?: string | null;
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
    replyTo: opts.operatorEmail ?? undefined,
  });
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
