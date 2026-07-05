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
