import { createAdminClient } from "@/utils/supabase/admin";

/**
 * The follow-up agent's send-log (booking_reminders, migration 0061): both the
 * one-reminder-per-booking-per-kind policy (unique constraint) and the
 * claim-before-send concurrency boundary (insert-first, like
 * claimWebhookEvent). Service-role — the cron sweep has no user session.
 */

export type ReminderKind = "balance" | "contract" | "quote";

/** Insert-first claim: true = ours to send; false = already sent/claimed
 *  (unique violation on (booking_id, kind)). */
export async function claimReminder(
  bookingId: string,
  operatorId: string,
  kind: ReminderKind,
): Promise<boolean> {
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("booking_reminders")
    .insert({ booking_id: bookingId, operator_id: operatorId, kind });
  if (!error) return true;
  // 23505 = unique_violation → already reminded (ever) or a concurrent run owns it.
  if ((error as { code?: string }).code === "23505") return false;
  throw new Error(`claimReminder failed: ${error.message}`);
}

/** Release a claim after a failed send so the next run retries. */
export async function releaseReminder(bookingId: string, kind: ReminderKind): Promise<void> {
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("booking_reminders")
    .delete()
    .eq("booking_id", bookingId)
    .eq("kind", kind);
  if (error) throw new Error(`releaseReminder failed: ${error.message}`);
}

/**
 * Claim a document-expiry reminder (document_reminders, migration 0064).
 * Unique on (document_id, expires_at): one reminder per expiry date, ever —
 * renewing the document (a new expires_at) re-arms it for the new date.
 */
export async function claimDocReminder(
  documentId: string,
  operatorId: string,
  expiresAt: string,
): Promise<boolean> {
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("document_reminders")
    .insert({ document_id: documentId, operator_id: operatorId, expires_at: expiresAt });
  if (!error) return true;
  if ((error as { code?: string }).code === "23505") return false;
  throw new Error(`claimDocReminder failed: ${error.message}`);
}

/** Release a document-expiry claim after a failed send so the next run retries. */
export async function releaseDocReminder(documentId: string, expiresAt: string): Promise<void> {
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("document_reminders")
    .delete()
    .eq("document_id", documentId)
    .eq("expires_at", expiresAt);
  if (error) throw new Error(`releaseDocReminder failed: ${error.message}`);
}
