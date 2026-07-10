import "server-only";
import {
  normalizeDeliveryConfig,
  resolveDeliveryFee,
  type DeliveryMode,
  type DeliveryLocation,
  type DeliveryQuote,
} from "./pricing";
import { geocodeAddress } from "./geocode";

/** The operator fields needed to price delivery for a destination. */
export interface OperatorDelivery {
  mode: DeliveryMode;
  /** flat fee / distance base fee (delivery_fee_cents). */
  flatCents: number;
  /** raw delivery_config JSONB. */
  config: unknown;
  lat: number | null;
  lon: number | null;
}

/**
 * Resolve an operator's delivery fee for a destination, geocoding the address
 * server-side when the operator prices by distance. Single source of truth for
 * createBooking + the checkout/builder fee previews.
 */
export async function resolveOperatorDeliveryFee(
  op: OperatorDelivery,
  dest: { zip?: string | null; town?: string | null; address?: string | null },
): Promise<DeliveryQuote> {
  const config = normalizeDeliveryConfig(op.config);
  let loc: DeliveryLocation = { zip: dest.zip, town: dest.town };
  if (op.mode === "distance" && dest.address) {
    const coords = await geocodeAddress(dest.address, dest.zip);
    if (coords) loc = { ...loc, lat: coords.lat, lon: coords.lon };
  }
  return resolveDeliveryFee(op.mode, config, op.flatCents, loc, { lat: op.lat, lon: op.lon });
}
