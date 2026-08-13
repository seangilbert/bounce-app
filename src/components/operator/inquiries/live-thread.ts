import type { InquiryDetail, ThreadMsg } from "@/lib/operator/inquiries";

/**
 * Pure helpers for the live inbox overlay (useInboxRealtime): messages that
 * arrived over realtime but aren't yet in the server-rendered props. The
 * server thread stays the source of truth — the overlay is additive sugar
 * that gets pruned as soon as a background refresh catches up.
 */

/** Raw postgres_changes INSERT payload row for inquiry_messages. */
export interface LiveMessageRow {
  id: string;
  inquiry_id: string;
  sender: "customer" | "operator" | "ai";
  body: string;
  channel: string | null;
  direction: "inbound" | "outbound" | null;
  created_at: string;
}

/** Payload row → the UI shape. Client-side time label until the server's
 *  relTime string replaces it on reconcile. */
export function liveToThreadMsg(row: LiveMessageRow): ThreadMsg {
  return {
    id: row.id,
    sender: row.sender,
    body: row.body,
    time: "Just now",
    channel: row.channel,
    direction: row.direction,
  };
}

/** Server thread + overlay, overlay entries deduped by id (an operator's own
 *  send can reach the server props before its realtime echo lands). */
export function mergeThread(serverThread: ThreadMsg[], overlay: ThreadMsg[]): ThreadMsg[] {
  if (overlay.length === 0) return serverThread;
  const seen = new Set(serverThread.map((m) => m.id));
  const fresh = overlay.filter((m) => !seen.has(m.id));
  return fresh.length ? [...serverThread, ...fresh] : serverThread;
}

/** Drop overlay entries the reconciled server props now include. Returns the
 *  SAME map instance when nothing changed (referential stability → no
 *  re-render loop from the prune effect). */
export function pruneOverlay(
  overlay: Map<string, ThreadMsg[]>,
  details: Record<string, InquiryDetail>,
): Map<string, ThreadMsg[]> {
  let changed = false;
  const next = new Map<string, ThreadMsg[]>();
  for (const [inquiryId, msgs] of overlay) {
    const serverIds = new Set((details[inquiryId]?.thread ?? []).map((m) => m.id));
    const remaining = msgs.filter((m) => !serverIds.has(m.id));
    if (remaining.length !== msgs.length) changed = true;
    if (remaining.length) next.set(inquiryId, remaining);
  }
  return changed ? next : overlay;
}
