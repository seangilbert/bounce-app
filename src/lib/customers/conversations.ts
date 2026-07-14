import { createAdminClient } from "@/utils/supabase/admin";
import type { InquirySender, ThreadMessage } from "@/lib/inquiries/repo";

/** How stale a thread can be and still be worth offering to resume. */
const RESUMABLE_DAYS = 60;

export interface ResumableConversation {
  inquiryId: string;
  updatedAt: string;
  messages: ThreadMessage[];
}

interface MessageRow {
  id: string;
  sender: InquirySender;
  body: string;
  created_at: string;
}
interface InquiryRow {
  id: string;
  created_at: string;
  inquiry_messages: MessageRow[] | null;
}

/**
 * The signed-in renter's most recent conversation with this operator, if it's
 * recent enough to be worth picking back up.
 *
 * The thread already exists — `inquiry_messages` has persisted every storefront
 * chat since migration 0021. What was missing was any way for the customer to
 * get back to it: the chat lives in React state, so a refresh dropped it.
 *
 * Deliberately NOT auto-loaded into the chat. A customer returning months later
 * is usually planning a *different* party, so the storefront offers the thread
 * and lets them choose (see the resume banner in Storefront.tsx).
 *
 * ONE round-trip. This used to be three sequential queries (customers →
 * inquiries → messages), which cost ~360ms on its own because every Supabase
 * call crosses a region boundary (~120ms). Embedding the messages and filtering
 * through the joins collapses it to a single call, and keying off the slug means
 * it doesn't have to wait for the operator lookup either.
 *
 * Scoping is enforced by the two `!inner` joins: the thread must belong to a
 * `customers` row owned by THIS account, AND to THIS operator. Drop either and
 * a renter could read someone else's conversation, or one operator's storefront
 * could surface a chat held with another.
 *
 * `accountId` is the auth user id — `customer_accounts.id` is 1:1 with
 * `auth.users.id` (migration 0046).
 */
export async function getResumableConversation(
  accountId: string,
  slug: string,
): Promise<ResumableConversation | null> {
  const cutoff = new Date(Date.now() - RESUMABLE_DAYS * 86_400_000).toISOString();

  const { data } = await createAdminClient()
    .from("inquiries")
    .select(
      "id, created_at, customers!inner(account_id), operators!inner(slug), " +
        "inquiry_messages(id, sender, body, created_at)",
    )
    .eq("customers.account_id", accountId)
    .eq("operators.slug", slug)
    .neq("status", "dismissed")
    .gte("created_at", cutoff)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) return null;
  const row = data as unknown as InquiryRow;

  const messages = sortThread(row.inquiry_messages ?? []);
  if (!messages.length) return null;

  return {
    inquiryId: row.id,
    // The banner says "from <date>", so it must be the LAST message, not the
    // inquiry's creation date.
    updatedAt: messages[messages.length - 1].createdAt,
    messages,
  };
}

/**
 * Chronological, with a stable tiebreak.
 *
 * Embedded rows come back unordered, and the 0021 backfill seeded the customer
 * message and the AI's answer at the *same* created_at — so without the rank
 * tiebreak the AI can appear to reply before it was asked. Mirrors the ordering
 * in `listMessagesByInquiry`.
 */
const RANK: Record<InquirySender, number> = { customer: 0, ai: 1, operator: 2 };

function sortThread(rows: MessageRow[]): ThreadMessage[] {
  return [...rows]
    .sort((a, b) =>
      a.created_at < b.created_at
        ? -1
        : a.created_at > b.created_at
          ? 1
          : RANK[a.sender] - RANK[b.sender],
    )
    .map((r) => ({ id: r.id, sender: r.sender, body: r.body, createdAt: r.created_at }));
}
