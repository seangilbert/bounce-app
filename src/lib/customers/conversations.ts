import { createAdminClient } from "@/utils/supabase/admin";
import { listMessagesByInquiry, type ThreadMessage } from "@/lib/inquiries/repo";

/** How stale a thread can be and still be worth offering to resume. */
const RESUMABLE_DAYS = 60;

export interface ResumableConversation {
  inquiryId: string;
  updatedAt: string;
  messages: ThreadMessage[];
}

/**
 * The signed-in renter's most recent conversation with THIS operator, if it's
 * recent enough to be worth picking back up.
 *
 * The thread already exists — `inquiry_messages` has persisted every storefront
 * chat since migration 0021. What was missing was any way for the customer to
 * get back to it: the chat lives in React state, so a refresh dropped it. This
 * is the read side of that.
 *
 * Deliberately NOT auto-loaded into the chat. A customer coming back months
 * later is usually planning a *different* party, and dropping them into an old
 * thread would be disorienting — so the storefront offers it and lets them
 * choose (see the resume banner in Storefront.tsx).
 *
 * Scoped by BOTH account-owned customer ids and operator: a renter must never
 * see a thread that isn't theirs, and a storefront must never surface a
 * conversation held with a different operator.
 */
export async function getResumableConversation(
  accountId: string,
  operatorId: string,
): Promise<ResumableConversation | null> {
  const supabase = createAdminClient();

  const { data: owned } = await supabase
    .from("customers")
    .select("id")
    .eq("account_id", accountId)
    .eq("operator_id", operatorId);
  const customerIds = (owned ?? []).map((r) => (r as { id: string }).id);
  if (!customerIds.length) return null;

  const cutoff = new Date(Date.now() - RESUMABLE_DAYS * 86_400_000).toISOString();
  const { data: inquiry } = await supabase
    .from("inquiries")
    .select("id, created_at")
    .eq("operator_id", operatorId)
    .in("customer_id", customerIds)
    .neq("status", "dismissed")
    .gte("created_at", cutoff)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!inquiry) return null;

  const id = (inquiry as { id: string; created_at: string }).id;
  const messages = (await listMessagesByInquiry([id])).get(id) ?? [];
  if (!messages.length) return null;

  return {
    inquiryId: id,
    updatedAt: messages[messages.length - 1].createdAt,
    messages,
  };
}
