/**
 * Deposit policy. A customer can pay a deposit now (the rest is due on
 * delivery) or pay in full. Shared by the storefront UI and the checkout route
 * so the displayed and charged amounts always agree.
 */
export const DEPOSIT_PERCENT = 30;

/** Deposit amount (minor units) for a subtotal at a given percent (default 30). */
export function depositAmount(subtotalCents: number, percent: number = DEPOSIT_PERCENT): number {
  return Math.round((subtotalCents * percent) / 100);
}
