import type { PriceUnit } from "./types";

/** Inclusive rental length in days for a `YYYY-MM-DD` range (same day = 1). */
export function durationDays(startDate: string, endDate: string): number {
  const s = new Date(`${startDate}T00:00:00Z`).getTime();
  const e = new Date(`${endDate}T00:00:00Z`).getTime();
  return Math.floor((e - s) / 86_400_000) + 1;
}

/**
 * Line total in minor units. `per_day` scales with rental length; `flat` and
 * `per_hour` are one-time at day granularity (per_hour is an intraday rate that
 * doesn't multiply across days in this day-level model).
 */
export function lineTotal(
  basePrice: number,
  priceUnit: PriceUnit,
  quantity: number,
  days: number,
): number {
  const multiplier = priceUnit === "per_day" ? days : 1;
  return basePrice * quantity * multiplier;
}

export interface PriceBreakdown {
  subtotal: number;
  /** Promo discount applied to the items subtotal (pre-tax). */
  discount: number;
  deliveryFee: number;
  tax: number;
  total: number;
}

/**
 * Canonical price breakdown (minor units). A promo discount reduces the items
 * subtotal first; tax then applies to the discounted subtotal plus, when
 * `deliveryTaxable`, the delivery fee (delivery itself is never discounted).
 * Single source of truth for createBooking, the AI quote, the storefront, and
 * checkout so every surface shows the same numbers.
 */
export function priceBreakdown(
  subtotal: number,
  deliveryFeeCents: number,
  taxPercent: number,
  deliveryTaxable = true,
  discountCents = 0,
): PriceBreakdown {
  const discount = Math.min(Math.max(0, Math.round(discountCents)), subtotal);
  const netSubtotal = subtotal - discount;
  const deliveryFee = deliveryFeeCents;
  const taxBase = deliveryTaxable ? netSubtotal + deliveryFee : netSubtotal;
  const tax = Math.round((taxBase * taxPercent) / 100);
  return { subtotal, discount, deliveryFee, tax, total: netSubtotal + deliveryFee + tax };
}
