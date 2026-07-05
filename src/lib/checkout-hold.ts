/**
 * How long an unpaid checkout (a booking in `pending_payment`) holds inventory
 * before it's treated as abandoned and released. Also used as the Stripe
 * Checkout Session lifetime, so a stale session can't be paid after its hold
 * has been released (which would otherwise risk an oversell).
 *
 * Stripe requires a session `expires_at` between 30 minutes and 24 hours out.
 */
export const CHECKOUT_HOLD_MINUTES = 60;
