import { listItems } from "@/lib/inventory/repo";
import { availabilityForOperator } from "@/lib/inventory/availability";
import { normalizeSchedule } from "@/lib/availability/schedule";
import type { Operator } from "@/lib/inventory/types";

/** Operator fields that are safe to expose on the public storefront/API — never
 *  Stripe ids, subscription status, or contact email. */
export interface PublicOperator {
  name: string;
  slug: string | null;
  location: string | null;
  phone: string | null;
  depositPercent: number;
  taxPercent: number;
  deliveryFeeCents: number;
  deliveryTaxable: boolean;
  deliveryMode: Operator["deliveryMode"];
  cancellationPolicy: string | null;
  damagePolicy: string | null;
  schedule: ReturnType<typeof normalizeSchedule>;
}

function toPublicOperator(operator: Operator): PublicOperator {
  return {
    name: operator.name,
    slug: operator.slug,
    location: operator.location,
    phone: operator.phone,
    depositPercent: operator.depositPercent,
    taxPercent: operator.taxPercent,
    deliveryFeeCents: operator.deliveryFeeCents,
    deliveryTaxable: operator.deliveryTaxable,
    deliveryMode: operator.deliveryMode,
    cancellationPolicy: operator.cancellationPolicy,
    damagePolicy: operator.damagePolicy,
    schedule: normalizeSchedule(operator.availabilityConfig),
  };
}

export interface StorefrontCatalog {
  operator: PublicOperator;
  startDate: string | null;
  endDate: string | null;
  items: Awaited<ReturnType<typeof listItems>> | Awaited<ReturnType<typeof availabilityForOperator>>;
}

/**
 * The public storefront catalog: an operator's active items, annotated with live
 * availability when a date range is given. Single source of truth for both the
 * first-party storefront (`/api/items`) and the public API (`/api/v1/catalog`).
 */
export async function buildStorefrontCatalog(
  operator: Operator,
  range: { start: string | null; end: string | null },
): Promise<StorefrontCatalog> {
  const { start, end } = range;
  const items =
    start && end
      ? await availabilityForOperator(operator.id, start, end)
      : await listItems(operator.id, { activeOnly: true });
  return { operator: toPublicOperator(operator), startDate: start, endDate: end, items };
}
