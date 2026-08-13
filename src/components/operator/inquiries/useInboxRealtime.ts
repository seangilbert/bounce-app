"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import type { InquiryDetail, ThreadMsg } from "@/lib/operator/inquiries";
import { liveToThreadMsg, pruneOverlay, type LiveMessageRow } from "./live-thread";

/**
 * The live inbox (inbox-plan Phase 2): hybrid streaming.
 *
 *  - New thread messages append IN PLACE via a client overlay (instant), then
 *    a debounced router.refresh() reconciles everything else — list order,
 *    previews, filters, nav badge, server time labels — and the overlay is
 *    pruned once the server props include the message.
 *  - inquiry_messages is subscribed UNFILTERED (it has no operator_id column;
 *    postgres_changes filters are single-column) — RLS (migration 0062)
 *    scopes delivery to this operator's threads.
 *  - Missed events (disconnect, laptop sleep) can't lie: every (re)connect
 *    fires a reconcile refresh, and server props are always the truth.
 */
export function useInboxRealtime(opts: {
  operatorId: string;
  selectedId: string;
  details: Record<string, InquiryDetail>;
}): {
  overlay: Map<string, ThreadMsg[]>;
  unreadIds: Set<string>;
  markRead: (inquiryId: string) => void;
} {
  const router = useRouter();
  const [overlay, setOverlay] = useState<Map<string, ThreadMsg[]>>(new Map());
  const [unreadIds, setUnreadIds] = useState<Set<string>>(new Set());

  // Refs keep the subscription effect keyed on operatorId alone — it must
  // never tear down on selection changes or background refreshes.
  const selectedIdRef = useRef(opts.selectedId);
  selectedIdRef.current = opts.selectedId;
  const detailsRef = useRef(opts.details);
  detailsRef.current = opts.details;

  // Reconcile: when a refresh delivers new server props, drop overlay entries
  // they now include (pruneOverlay preserves map identity when nothing changed).
  useEffect(() => {
    setOverlay((prev) => pruneOverlay(prev, opts.details));
  }, [opts.details]);

  useEffect(() => {
    const supabase = createClient();
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;
    const debouncedRefresh = () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => router.refresh(), 800);
    };

    const onMessage = (row: LiveMessageRow) => {
      const known =
        detailsRef.current[row.inquiry_id]?.thread.some((m) => m.id === row.id) ?? false;
      setOverlay((prev) => {
        const existing = prev.get(row.inquiry_id) ?? [];
        if (known || existing.some((m) => m.id === row.id)) return prev; // own-send echo
        const next = new Map(prev);
        next.set(row.inquiry_id, [...existing, liveToThreadMsg(row)]);
        return next;
      });
      if (!known && row.sender === "customer" && row.inquiry_id !== selectedIdRef.current) {
        setUnreadIds((prev) => (prev.has(row.inquiry_id) ? prev : new Set(prev).add(row.inquiry_id)));
      }
      // Always reconcile: list previews/order, filters, badge, honest times.
      debouncedRefresh();
    };

    // Unique per-mount topic — the singleton browser client returns an
    // existing channel for a reused topic (already subscribed after a Strict
    // Mode re-mount), and adding callbacks to it throws.
    const channel = supabase
      .channel(`inbox:${opts.operatorId}:${crypto.randomUUID()}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "inquiry_messages" },
        (payload) => onMessage(payload.new as LiveMessageRow),
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "inquiries", filter: `operator_id=eq.${opts.operatorId}` },
        debouncedRefresh,
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "inquiries", filter: `operator_id=eq.${opts.operatorId}` },
        debouncedRefresh,
      )
      .subscribe((status) => {
        // supabase-js reconnects with backoff on its own; events during the
        // gap are lost, so reconcile on every (re)connect.
        if (status === "SUBSCRIBED") debouncedRefresh();
      });

    return () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      supabase.removeChannel(channel);
    };
    // router is stable (next/navigation); deliberately keyed on operatorId only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opts.operatorId]);

  const markRead = (inquiryId: string) =>
    setUnreadIds((prev) => {
      if (!prev.has(inquiryId)) return prev;
      const next = new Set(prev);
      next.delete(inquiryId);
      return next;
    });

  return { overlay, unreadIds, markRead };
}
