import { planCapabilities } from "@/lib/plans";
import type { Item } from "./types";

/** Abuse guard on total catalog size, independent of plan. Hidden items are
 *  uncapped by plan limits (imports land whole), but never beyond this. */
export const MAX_TOTAL_ITEMS = 500;

type Capped = Pick<Item, "id" | "createdAt">;
type Billed = Parameters<typeof planCapabilities>[0];

/**
 * Enforce a plan's live-item cap on an already-active item list at read time.
 *
 * The cap is normally kept by the activate-time check in the inventory actions,
 * but an operator can be downgraded per-request with no event firing (trial
 * lapse via the effectivePlanId fallback, missed webhook, past_due expiring) —
 * so every public read must apply it too, or a lapsed operator keeps serving
 * their whole trial catalog. Selection is oldest-first (createdAt, then id) so
 * the visible set is stable across requests; input order is preserved for
 * presentation.
 */
export function applyLiveItemCap<T extends Capped>(items: T[], cap: number): T[] {
  if (!Number.isFinite(cap) || items.length <= cap) return items;
  const keep = new Set(
    [...items]
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
      .slice(0, Math.max(0, cap))
      .map((i) => i.id),
  );
  return items.filter((i) => keep.has(i.id));
}

/** The active items an operator's plan actually serves publicly right now. */
export function liveCatalog<T extends Capped>(operator: Billed, items: T[]): T[] {
  return applyLiveItemCap(items, planCapabilities(operator).maxItems);
}
