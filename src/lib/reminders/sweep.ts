import { createAdminClient } from "@/utils/supabase/admin";
import { getOperatorById } from "@/lib/inventory/repo";
import { getBooking } from "@/lib/bookings/repo";
import { getOrderByBookingId } from "@/lib/orders/repo";
import { getESignatureProvider } from "@/lib/esign";
import { operatorToday } from "@/lib/operator/time";
import { publicUrl, appUrl } from "@/lib/urls";
import {
  sendEmail,
  buildBalanceReminderEmail,
  buildContractReminderEmail,
  buildQuoteReminderEmail,
  buildDocExpiryEmail,
} from "@/lib/email";
import { inboundReplyAddress } from "@/lib/email/inbound";
import { findInquiryIdByBooking } from "@/lib/inquiries/repo";
import { DOC_TYPES, docTypeLabel, type DocType } from "@/lib/documents/types";
import { draftReminderIntro, type ReminderFacts, type ReminderKind } from "@/lib/llm/assistant";
import { fallbackReminderIntro } from "./copy";
import { claimReminder, releaseReminder, claimDocReminder, releaseDocReminder } from "./repo";
import type { Operator } from "@/lib/inventory/types";

/**
 * The follow-up agent's nightly sweep (invoked by /api/cron/reminders):
 * cross-tenant, service-role, idempotent at any cadence.
 *
 *   balance  — paid-ish booking with money still owed, event within 3 days →
 *              email a pay link (/pay/<id>?type=balance).
 *   contract — booking stuck in 'contracted' 48h+ with a SignWell doc still
 *              unsigned → best-effort SignWell re-send + our branded nudge.
 *   quote    — operator-sent quote (quote_sent_at set) still 'quoted' 3+ days
 *              later with a future event → check-in email with the /pay link.
 *              Storefront quotes abandoned mid-checkout have no quote_sent_at
 *              and are never touched.
 *   docs     — OPERATOR-facing: business documents (COI, license…) expired or
 *              expiring within 14 days → one digest email per operator, once
 *              per (document, expiry date). Deterministic copy, no AI.
 *
 * Safety model: per-operator OPT-IN toggles for the customer-facing lanes
 * (remind_balance/remind_contract/remind_quote, default false; the operator-
 * facing doc lane is notify_doc_expiry, default true like its notify_*
 * siblings) · ONE reminder per booking per kind, ever (claim-before-send on
 * booking_reminders; a failed send releases the claim so the next run
 * retries) · per-run caps bound the blast radius of any bug · AI copy is
 * intro-only with a deterministic fallback; every number is rendered from the
 * DB. expireStaleCheckouts isn't needed here — it only touches
 * pending_payment, which this sweep never targets.
 */

const GLOBAL_SEND_CAP = 50;
const PER_OPERATOR_CAP = 10;
const BALANCE_WINDOW_DAYS = 3; // event within 3 days (operator-local)
const CONTRACT_STALE_HOURS = 48; // contracted 48h+ without a signature
const QUOTE_STALE_DAYS = 3; // quote sent 3+ days ago, still unbooked
const MIN_BOOKING_AGE_HOURS = 24; // never nudge a freshly created booking
const DOC_EXPIRY_WINDOW_DAYS = 14; // heads-up horizon for expiring documents

export interface ReminderSweepResult {
  balanceSent: number;
  contractSent: number;
  quoteSent: number;
  docExpirySent: number;
  skipped: number;
  failed: number;
}

interface CandidateRow {
  id: string;
  operator_id: string;
  status: string;
  start_date: string;
  end_date: string;
  total: number | null;
  deposit: number | null;
  customer_email: string | null;
  customer_name: string | null;
  created_at: string;
  updated_at: string;
  quote_sent_at: string | null;
}

const CANDIDATE_COLS =
  "id, operator_id, status, start_date, end_date, total, deposit, customer_email, customer_name, created_at, updated_at, quote_sent_at";

interface DocCandidateRow {
  id: string;
  operator_id: string;
  type: DocType;
  label: string | null;
  expires_at: string;
}

const money = (c: number) => `$${(c / 100).toLocaleString("en-US")}`;

function fmtEventDate(start: string, end: string): string {
  const f = (iso: string) =>
    new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      timeZone: "UTC",
    });
  return start === end ? f(start) : `${f(start)} → ${f(end)}`;
}

/** YYYY-MM-DD + n days (UTC-safe on date-only strings). */
function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function hoursSince(iso: string): number {
  return (Date.now() - new Date(iso).getTime()) / 3_600_000;
}

/** Whole days from one YYYY-MM-DD to another (negative = already past). */
function daysBetween(from: string, to: string): number {
  return Math.round(
    (new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime()) / 86_400_000,
  );
}

/** Loose UTC-windowed candidate queries; the precise per-operator gate runs in
 *  JS with operatorToday(op.timezone) (deposit is nullable, so the balance
 *  arithmetic can't be a SQL predicate anyway — matches getDashboard's style). */
async function loadCandidates(): Promise<{
  balance: CandidateRow[];
  contract: CandidateRow[];
  quote: CandidateRow[];
}> {
  const supabase = createAdminClient();
  const utcToday = new Date().toISOString().slice(0, 10);
  const staleCutoff = new Date(Date.now() - CONTRACT_STALE_HOURS * 3_600_000).toISOString();
  const quoteCutoff = new Date(Date.now() - QUOTE_STALE_DAYS * 86_400_000).toISOString();

  const [bal, con, quo] = await Promise.all([
    supabase
      .from("bookings")
      .select(CANDIDATE_COLS)
      // Deliberately NOT delivered/completed (the dashboard's PAID_PLUS
      // includes them): once the event has started, a nudge is noise.
      .in("status", ["paid", "contracted", "confirmed"])
      .gte("start_date", addDays(utcToday, -1))
      .lte("start_date", addDays(utcToday, BALANCE_WINDOW_DAYS + 1)),
    supabase
      .from("bookings")
      .select(CANDIDATE_COLS)
      .eq("status", "contracted")
      .gte("start_date", addDays(utcToday, -1))
      .lt("updated_at", staleCutoff),
    supabase
      .from("bookings")
      .select(CANDIDATE_COLS)
      .eq("status", "quoted")
      .gte("start_date", addDays(utcToday, -1))
      .not("quote_sent_at", "is", null)
      .lt("quote_sent_at", quoteCutoff),
  ]);
  if (bal.error) throw new Error(`reminder balance query failed: ${bal.error.message}`);
  if (con.error) throw new Error(`reminder contract query failed: ${con.error.message}`);
  if (quo.error) throw new Error(`reminder quote query failed: ${quo.error.message}`);
  return {
    balance: (bal.data ?? []) as CandidateRow[],
    contract: (con.data ?? []) as CandidateRow[],
    quote: (quo.data ?? []) as CandidateRow[],
  };
}

/** Documents with an expiry date on or before the heads-up horizon (loose UTC
 *  window; the tracked-type filter + precise operator-local day math run in JS). */
async function loadDocCandidates(): Promise<DocCandidateRow[]> {
  const supabase = createAdminClient();
  const utcToday = new Date().toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from("documents")
    .select("id, operator_id, type, label, expires_at")
    .not("expires_at", "is", null)
    .lte("expires_at", addDays(utcToday, DOC_EXPIRY_WINDOW_DAYS + 1));
  if (error) throw new Error(`reminder doc query failed: ${error.message}`);
  return (data ?? []) as DocCandidateRow[];
}

export async function runReminderSweep(): Promise<ReminderSweepResult> {
  const result: ReminderSweepResult = {
    balanceSent: 0,
    contractSent: 0,
    quoteSent: 0,
    docExpirySent: 0,
    skipped: 0,
    failed: 0,
  };
  const { balance, contract, quote } = await loadCandidates();

  // Group by operator so we load each operator (and its toggles) exactly once.
  const byOperator = new Map<string, { kind: ReminderKind; row: CandidateRow }[]>();
  for (const row of balance) {
    byOperator.set(row.operator_id, [...(byOperator.get(row.operator_id) ?? []), { kind: "balance", row }]);
  }
  for (const row of contract) {
    byOperator.set(row.operator_id, [...(byOperator.get(row.operator_id) ?? []), { kind: "contract", row }]);
  }
  for (const row of quote) {
    byOperator.set(row.operator_id, [...(byOperator.get(row.operator_id) ?? []), { kind: "quote", row }]);
  }

  let totalSent = 0;
  for (const [operatorId, candidates] of byOperator) {
    if (totalSent >= GLOBAL_SEND_CAP) break;
    let operator: Operator | null = null;
    try {
      operator = await getOperatorById(operatorId);
    } catch (e) {
      console.error(`[reminders] operator load failed (${operatorId}):`, e);
    }
    if (!operator) {
      result.skipped += candidates.length;
      continue;
    }
    const today = operatorToday(operator.timezone);
    let operatorSent = 0;

    for (const { kind, row } of candidates) {
      if (totalSent >= GLOBAL_SEND_CAP || operatorSent >= PER_OPERATOR_CAP) {
        result.skipped++;
        continue;
      }

      // ── Cheap skips, before any claim. ──
      const enabled =
        kind === "balance"
          ? operator.remindBalance
          : kind === "contract"
            ? operator.remindContract
            : operator.remindQuote;
      const balanceCents = (row.total ?? 0) - (row.deposit ?? 0);
      if (
        !enabled ||
        !row.customer_email ||
        hoursSince(row.created_at) < MIN_BOOKING_AGE_HOURS ||
        row.start_date < today ||
        (kind === "balance" &&
          (balanceCents <= 0 || row.start_date > addDays(today, BALANCE_WINDOW_DAYS))) ||
        // Quote lane: only quotes the operator actually SENT, 3+ days ago
        // (re-gated in JS — the SQL cutoff already filtered, defense in depth).
        (kind === "quote" &&
          (!row.quote_sent_at || hoursSince(row.quote_sent_at) < QUOTE_STALE_DAYS * 24))
      ) {
        result.skipped++;
        continue;
      }

      // Contract lane: only when a SignWell doc exists and is still unsigned.
      // ("signed" = customer done, waiting on countersigner — never nudge.)
      let esignDocumentId: string | null = null;
      if (kind === "contract") {
        try {
          const order = await getOrderByBookingId(row.id);
          if (!order?.esignDocumentId || !["sent", "viewed"].includes(order.esignStatus ?? "")) {
            result.skipped++;
            continue;
          }
          esignDocumentId = order.esignDocumentId;
        } catch (e) {
          console.error(`[reminders] order lookup failed (${row.id}):`, e);
          result.skipped++;
          continue;
        }
      }

      // ── Claim BEFORE send: everything after this completes or releases. ──
      let claimed = false;
      try {
        claimed = await claimReminder(row.id, operatorId, kind);
        if (!claimed) {
          result.skipped++; // already reminded (ever) or a concurrent run owns it
          continue;
        }

        const booking = await getBooking(row.id);
        if (!booking) throw new Error("booking vanished after claim");
        // Quote race: the customer may have paid between the candidate query
        // and this claim — never tell a paying customer their quote is idle.
        if (kind === "quote" && booking.status !== "quoted") {
          await releaseReminder(row.id, kind);
          result.skipped++;
          continue;
        }

        const facts: ReminderFacts = {
          customerFirstName: row.customer_name?.split(/\s+/)[0] || undefined,
          eventDateLabel: fmtEventDate(row.start_date, row.end_date),
          itemNames: booking.items.map((li) => li.name),
          ...(kind === "balance" ? { balanceLabel: money(balanceCents) } : {}),
          ...(kind === "quote" ? { totalLabel: money(booking.total) } : {}),
        };

        // AI intro with a deterministic floor — a model hiccup never blocks
        // the send (and never releases the claim).
        let intro: string;
        try {
          intro = await draftReminderIntro(operator, kind, facts);
        } catch (e) {
          console.warn(`[reminders] AI intro fell back (${row.id}/${kind}):`, e);
          intro = fallbackReminderIntro(kind, operator.name, facts);
        }

        let email;
        if (kind === "balance") {
          email = buildBalanceReminderEmail({
            booking,
            operator,
            to: row.customer_email,
            balanceCents,
            payUrl: publicUrl(`/pay/${booking.id}?type=balance`),
            intro,
          });
        } else if (kind === "quote") {
          // Reply-To routes back into the live inbox thread when the quote
          // came from one (plus-address); best-effort — falls back to the
          // operator's contact email inside the builder.
          let replyTo: string | null = null;
          try {
            const inquiryId = await findInquiryIdByBooking(row.id);
            if (inquiryId) replyTo = inboundReplyAddress(inquiryId);
          } catch (e) {
            console.error(`[reminders] inquiry lookup failed (${row.id}):`, e);
          }
          email = buildQuoteReminderEmail({
            booking,
            operator,
            to: row.customer_email,
            payUrl: publicUrl(`/pay/${booking.id}`),
            intro,
            replyTo,
          });
        } else {
          // Best-effort SignWell re-send; a failure only changes the phrasing.
          let signwellResent = false;
          try {
            const provider = getESignatureProvider();
            if (provider.remind && esignDocumentId) {
              await provider.remind(esignDocumentId);
              signwellResent = true;
            }
          } catch (e) {
            console.error(`[reminders] SignWell remind failed (${row.id}):`, e);
          }
          email = buildContractReminderEmail({
            booking,
            operator,
            to: row.customer_email,
            intro,
            signwellResent,
          });
        }

        const sent = await sendEmail(email); // never throws — check ok
        if (sent.ok) {
          if (kind === "balance") result.balanceSent++;
          else if (kind === "quote") result.quoteSent++;
          else result.contractSent++;
          operatorSent++;
          totalSent++;
        } else {
          await releaseReminder(row.id, kind);
          result.failed++;
        }
      } catch (e) {
        console.error(`[reminders] candidate failed (${row.id}/${kind}):`, e);
        if (claimed) {
          try {
            await releaseReminder(row.id, kind);
          } catch (re) {
            console.error(`[reminders] claim release failed (${row.id}/${kind}):`, re);
          }
        }
        result.failed++;
      }
    }
  }

  // ── Document-expiry lane (operator-facing digest, one email per operator). ──
  try {
    totalSent = await sweepDocExpiry(result, totalSent);
  } catch (e) {
    console.error("[reminders] doc-expiry lane failed:", e);
    result.failed++;
  }

  console.log(
    `[reminders] sweep: ${result.balanceSent} balance, ${result.contractSent} contract, ` +
      `${result.quoteSent} quote, ${result.docExpirySent} doc-expiry, ` +
      `${result.skipped} skipped, ${result.failed} failed`,
  );
  return result;
}

const TRACKED_DOC_TYPES = new Set(DOC_TYPES.filter((t) => t.tracksExpiry).map((t) => t.value));

/** One digest email per operator listing every newly-due expiring document.
 *  Claims each (document, expires_at) BEFORE the send; a failed send releases
 *  all of that operator's claims so the next run retries. Mutates `result`
 *  counters and returns the updated global sent count. */
async function sweepDocExpiry(result: ReminderSweepResult, totalSent: number): Promise<number> {
  const docs = await loadDocCandidates();

  const byOperator = new Map<string, DocCandidateRow[]>();
  for (const doc of docs) {
    if (!TRACKED_DOC_TYPES.has(doc.type)) continue; // W-9s etc. don't expire
    byOperator.set(doc.operator_id, [...(byOperator.get(doc.operator_id) ?? []), doc]);
  }

  for (const [operatorId, candidates] of byOperator) {
    if (totalSent >= GLOBAL_SEND_CAP) {
      result.skipped += candidates.length;
      continue;
    }
    let operator: Operator | null = null;
    try {
      operator = await getOperatorById(operatorId);
    } catch (e) {
      console.error(`[reminders] operator load failed (${operatorId}):`, e);
    }
    if (!operator || !operator.notifyDocExpiry || !operator.contactEmail) {
      result.skipped += candidates.length;
      continue;
    }

    const today = operatorToday(operator.timezone);
    const claimed: { doc: DocCandidateRow; daysLeft: number }[] = [];
    try {
      for (const doc of candidates) {
        const daysLeft = daysBetween(today, doc.expires_at);
        if (daysLeft > DOC_EXPIRY_WINDOW_DAYS) {
          result.skipped++; // loose UTC window overshot the operator-local one
          continue;
        }
        if (await claimDocReminder(doc.id, operatorId, doc.expires_at)) {
          claimed.push({ doc, daysLeft });
        } else {
          result.skipped++; // already reminded for this expiry date
        }
      }
      if (claimed.length === 0) continue;

      const email = buildDocExpiryEmail({
        operatorName: operator.name,
        to: operator.contactEmail,
        docs: claimed
          .sort((a, b) => a.daysLeft - b.daysLeft)
          .map(({ doc, daysLeft }) => ({
            label: doc.label?.trim() || docTypeLabel(doc.type),
            expiresAt: doc.expires_at,
            daysLeft,
          })),
        docsUrl: appUrl("/documents"),
      });
      const sent = await sendEmail(email); // never throws — check ok
      if (sent.ok) {
        result.docExpirySent++;
        totalSent++;
      } else {
        for (const { doc } of claimed) await releaseDocReminder(doc.id, doc.expires_at);
        result.failed++;
      }
    } catch (e) {
      console.error(`[reminders] doc-expiry operator failed (${operatorId}):`, e);
      for (const { doc } of claimed) {
        try {
          await releaseDocReminder(doc.id, doc.expires_at);
        } catch (re) {
          console.error(`[reminders] doc claim release failed (${doc.id}):`, re);
        }
      }
      result.failed++;
    }
  }
  return totalSent;
}
