/**
 * Delivery-fee resolution. Three operator-selectable models:
 *  - flat:     one fee per booking (the operator's delivery_fee_cents).
 *  - zones:    named service areas matched by ZIP (primary) or town; each has a
 *              fee. No match → the "outside area" fee, or null = quote by hand.
 *  - distance: free within N miles of storage, then $/mile up to a max radius
 *              (beyond = out of area). Base fee = delivery_fee_cents.
 *
 * A per-booking override always wins over any computed fee.
 */

export type DeliveryMode = "flat" | "zones" | "distance";

export interface DeliveryZone {
  id: string;
  label: string;
  feeCents: number;
  zips: string[];
  towns: string[];
}

export interface DistanceConfig {
  freeMiles: number;
  perMileCents: number;
  /** null = no upper bound (never "out of area" on distance alone). */
  maxMiles: number | null;
}

export interface DeliveryConfig {
  zones: DeliveryZone[];
  /** Fee when no zone matches. null = can't auto-price → quote by hand. */
  outOfAreaCents: number | null;
  distance: DistanceConfig;
}

/** A normalized, defaulted config from the operator's raw JSONB. */
export function normalizeDeliveryConfig(raw: unknown): DeliveryConfig {
  const c = (raw ?? {}) as Partial<DeliveryConfig>;
  const zones = Array.isArray(c.zones)
    ? c.zones.map((z) => ({
        id: String(z?.id ?? ""),
        label: String(z?.label ?? ""),
        feeCents: Math.max(0, Math.round(Number(z?.feeCents ?? 0))),
        zips: Array.isArray(z?.zips) ? z.zips.map(normalizeZip).filter(Boolean) : [],
        towns: Array.isArray(z?.towns) ? z.towns.map(normalizeTown).filter(Boolean) : [],
      }))
    : [];
  const d = (c.distance ?? {}) as Partial<DistanceConfig>;
  return {
    zones,
    outOfAreaCents:
      c.outOfAreaCents === null || c.outOfAreaCents === undefined
        ? null
        : Math.max(0, Math.round(Number(c.outOfAreaCents))),
    distance: {
      freeMiles: Math.max(0, Number(d.freeMiles ?? 0)),
      perMileCents: Math.max(0, Math.round(Number(d.perMileCents ?? 0))),
      maxMiles: d.maxMiles === null || d.maxMiles === undefined ? null : Math.max(0, Number(d.maxMiles)),
    },
  };
}

/** ZIP → first 5 digits (US), or "" if not a usable ZIP. */
export function normalizeZip(raw: unknown): string {
  const m = String(raw ?? "").match(/\d{5}/);
  return m ? m[0] : "";
}

/** Town → lowercased, trimmed, collapsed whitespace. */
export function normalizeTown(raw: unknown): string {
  return String(raw ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

/** Great-circle distance in miles between two lat/lon points. */
export function haversineMiles(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number },
): number {
  const R = 3958.7613; // Earth radius, miles
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Where we're delivering to, as much as is known at pricing time. */
export interface DeliveryLocation {
  zip?: string | null;
  town?: string | null;
  lat?: number | null;
  lon?: number | null;
}

export interface DeliveryQuote {
  /** Resolved fee in cents, or null when it can't be auto-priced. */
  feeCents: number | null;
  /** True when the destination is outside the service area / unpriceable. */
  outOfArea: boolean;
  /** True when we lack the info needed to price (e.g. distance w/o coords). */
  needsLocation: boolean;
  /** Human label for the resolved zone / distance, for display. */
  label?: string;
  miles?: number;
}

/**
 * Resolve the delivery fee for a destination. Pure — the caller supplies any
 * geocoded coordinates. `flatCents` is the operator's delivery_fee_cents
 * (flat fee / distance base fee). `origin` is the storage lat/lon.
 */
export function resolveDeliveryFee(
  mode: DeliveryMode,
  config: DeliveryConfig,
  flatCents: number,
  loc: DeliveryLocation,
  origin?: { lat: number | null; lon: number | null },
): DeliveryQuote {
  if (mode === "flat") {
    return { feeCents: flatCents, outOfArea: false, needsLocation: false };
  }

  if (mode === "zones") {
    const zip = normalizeZip(loc.zip);
    const town = normalizeTown(loc.town);
    if (!zip && !town) {
      return { feeCents: null, outOfArea: false, needsLocation: true };
    }
    for (const z of config.zones) {
      const hit = (zip && z.zips.includes(zip)) || (town && z.towns.includes(town));
      if (hit) return { feeCents: z.feeCents, outOfArea: false, needsLocation: false, label: z.label };
    }
    if (config.outOfAreaCents === null) {
      return { feeCents: null, outOfArea: true, needsLocation: false };
    }
    return { feeCents: config.outOfAreaCents, outOfArea: false, needsLocation: false, label: "Outside service area" };
  }

  // distance
  const hasDest = loc.lat != null && loc.lon != null;
  const hasOrigin = origin?.lat != null && origin?.lon != null;
  if (!hasDest || !hasOrigin) {
    return { feeCents: null, outOfArea: false, needsLocation: true };
  }
  const miles = haversineMiles(
    { lat: origin!.lat!, lon: origin!.lon! },
    { lat: loc.lat!, lon: loc.lon! },
  );
  const { freeMiles, perMileCents, maxMiles } = config.distance;
  if (maxMiles != null && miles > maxMiles) {
    return { feeCents: null, outOfArea: true, needsLocation: false, miles };
  }
  const billable = Math.max(0, miles - freeMiles);
  const feeCents = flatCents + Math.round(billable * perMileCents);
  return {
    feeCents,
    outOfArea: false,
    needsLocation: false,
    miles,
    label: `${miles.toFixed(1)} mi`,
  };
}
