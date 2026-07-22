/** Max length for the free-text customer policy fields (cancellation + damage).
 *  The DB column is unbounded `text`; this is a sane ceiling for content that
 *  renders inline at checkout, in emails, and (dormant) in the contract. Truly
 *  long/formal policies should become a linked document (see ROADMAP). */
export const POLICY_MAX_CHARS = 10000;

/** Max length for an operator's custom AI-assistant instructions. Tighter than
 *  the policy fields on purpose: this text is injected into the assistant's
 *  system prompt on EVERY inquiry, so it carries a per-call token cost. ~4k chars
 *  (~1k tokens) is generous for guidance while keeping that cost bounded. */
export const ASSISTANT_INSTRUCTIONS_MAX_CHARS = 4000;
