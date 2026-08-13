"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";

/**
 * Live "Needs you" nav badge (inbox-plan Phase 2). Starts from the
 * server-rendered count and re-queries (RLS-scoped, policy 0054 — the
 * browser-client twin of countNeedsHuman) whenever this operator's inquiries
 * change. A cheap HEAD count per change beats a layout-wide router.refresh()
 * on every message from every page.
 */
export function useNeedsHumanCount(operatorId: string | null, initial: number): number {
  const [count, setCount] = useState(initial);

  // A server refresh (navigation, inbox reconcile) delivers a fresh value —
  // re-sync so the two sources can't drift.
  useEffect(() => setCount(initial), [initial]);

  useEffect(() => {
    if (!operatorId) return;
    const supabase = createClient();
    let timer: ReturnType<typeof setTimeout> | null = null;

    const requery = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(async () => {
        const { count: fresh, error } = await supabase
          .from("inquiries")
          .select("id", { count: "exact", head: true })
          .eq("operator_id", operatorId)
          .eq("owner", "needs_human");
        if (!error && fresh != null) setCount(fresh);
      }, 1000);
    };

    // Unique per-mount topic: the browser client is a singleton, and reusing a
    // topic (Sidebar + BottomNav both mount this hook; Strict Mode re-mounts)
    // returns the FIRST mount's already-subscribed channel — adding callbacks
    // to it throws. Topic names are purely local, so uniqueness is free.
    const channel = supabase
      .channel(`needs-human:${operatorId}:${crypto.randomUUID()}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "inquiries", filter: `operator_id=eq.${operatorId}` },
        requery,
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "inquiries", filter: `operator_id=eq.${operatorId}` },
        requery,
      )
      .subscribe();

    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [operatorId]);

  return count;
}
