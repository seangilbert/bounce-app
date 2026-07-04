import Anthropic from "@anthropic-ai/sdk";

let client: Anthropic | null = null;

/**
 * Returns a lazily-initialized Anthropic client.
 *
 * The client reads `ANTHROPIC_API_KEY` from the environment. We construct it
 * lazily (rather than at module load) so a missing key only fails the request
 * that needs Claude, not the whole app at boot.
 */
export function getAnthropicClient(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set. Add it to .env.local (see .env.local.example).",
    );
  }
  if (!client) {
    client = new Anthropic();
  }
  return client;
}
