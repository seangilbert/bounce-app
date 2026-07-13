/** Max length for the free-text customer policy fields (cancellation + damage).
 *  The DB column is unbounded `text`; this is a sane ceiling for content that
 *  renders inline at checkout, in emails, and (dormant) in the contract. Truly
 *  long/formal policies should become a linked document (see ROADMAP). */
export const POLICY_MAX_CHARS = 10000;
