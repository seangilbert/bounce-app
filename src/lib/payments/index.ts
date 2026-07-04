import type { PaymentProvider } from "./types";
import { stripeProvider } from "./stripe";

export * from "./types";

/**
 * Returns the active payment provider, selected by the PAYMENT_PROVIDER env
 * var (defaults to "stripe"). This is the only place call sites should obtain
 * a provider — swap providers by changing the env var, not the code.
 */
export function getPaymentProvider(): PaymentProvider {
  const name = (process.env.PAYMENT_PROVIDER ?? "stripe").toLowerCase();
  switch (name) {
    case "stripe":
      return stripeProvider;
    case "square":
      throw new Error(
        "PAYMENT_PROVIDER=square is not implemented yet. Set PAYMENT_PROVIDER=stripe.",
      );
    default:
      throw new Error(`Unknown PAYMENT_PROVIDER: "${name}". Use "stripe" or "square".`);
  }
}
