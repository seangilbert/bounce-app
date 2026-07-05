import type { ESignatureProvider } from "./types";
import { signwellProvider } from "./signwell";

export * from "./types";

/**
 * Returns the active e-signature provider, selected by the ESIGN_PROVIDER env
 * var (defaults to "signwell"). The only place call sites should obtain a
 * provider — swap providers by changing the env var, not the code.
 */
export function getESignatureProvider(): ESignatureProvider {
  const name = (process.env.ESIGN_PROVIDER ?? "signwell").toLowerCase();
  switch (name) {
    case "signwell":
      return signwellProvider;
    default:
      throw new Error(`Unknown ESIGN_PROVIDER: "${name}". Use "signwell".`);
  }
}
