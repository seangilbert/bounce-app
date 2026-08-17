import { planCapabilities } from "@/lib/plans";

/**
 * Platform application fee on connected-account (destination) charges.
 *
 * With destination charges Stripe debits its processing fee from the PLATFORM's
 * balance while the full amount transfers to the operator — so with no
 * application fee, the platform loses ~2.9% + 30¢ on every booking it processes
 * (docs/pricing-plan.md, finding F1). The model decided 2026-08-17:
 *
 *   application fee = processing pass-through (2.9% + 30¢, every plan)
 *                   + plan surcharge (Free 2%, Solo/Growing 0%)
 *
 * The pass-through means operators bear standard card processing — the framing
 * every SaaS uses and customers accept. The Free surcharge makes free riders
 * self-funding and creates the upgrade math (Solo pays for itself at ~$1,450/mo
 * in bookings). Fees only exist where a transfer exists: non-connected charges
 * stay on the platform account, so there is nothing to claw back.
 */

/** Stripe's standard card rate we pass through, in basis points. */
export const PROCESSING_FEE_BPS = 290;
/** Stripe's fixed per-charge cost we pass through, in cents. */
export const PROCESSING_FEE_FIXED_CENTS = 30;

type Billed = Parameters<typeof planCapabilities>[0];

/** The plan surcharge in bps — `PLATFORM_FEE_BPS` (when set > 0) is a global
 *  override for emergency tuning; otherwise the operator's effective plan
 *  decides, which means a lapsed paid plan pays Free's surcharge (the same
 *  belt `effectivePlanId` provides everywhere else). */
export function surchargeBps(op: Billed): number {
  const override = Number(process.env.PLATFORM_FEE_BPS ?? 0);
  if (override > 0) return override;
  return planCapabilities(op).platformFeeBps;
}

/**
 * The `application_fee_amount` for one charge, in cents. Clamped to the charge
 * amount (Stripe rejects a fee larger than the charge).
 */
export function applicationFeeCents(amountCents: number, op: Billed): number {
  if (amountCents <= 0) return 0;
  const bps = PROCESSING_FEE_BPS + surchargeBps(op);
  const fee = Math.round((amountCents * bps) / 10_000) + PROCESSING_FEE_FIXED_CENTS;
  return Math.min(fee, amountCents);
}

/** Human copy for the marketing/pricing surfaces, derived so it can't drift. */
export function processingFeeLabel(): string {
  return `${(PROCESSING_FEE_BPS / 100).toFixed(1)}% + ${PROCESSING_FEE_FIXED_CENTS}¢`;
}
