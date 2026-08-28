/**
 * fetch that retries GET/HEAD exactly once on a network-level failure.
 *
 * Supabase sits behind Cloudflare, which closes idle keep-alive connections;
 * a long-lived server process (dev server, warm lambda) that reuses a dead
 * pooled socket gets `TypeError: fetch failed` instead of a response — seen
 * live as intermittent `listMembershipsForUser failed: TypeError: fetch
 * failed` on the first request after idle. A fresh attempt opens a new
 * connection and succeeds.
 *
 * Reads only: retrying a failed POST/PATCH/DELETE could double-apply a write
 * (the failure happens after send in the stale-socket case), so non-idempotent
 * methods still fail fast.
 */
export const resilientFetch: typeof fetch = async (input, init) => {
  try {
    return await fetch(input, init);
  } catch (e) {
    const method = (
      init?.method ?? (input instanceof Request ? input.method : "GET")
    ).toUpperCase();
    if (method === "GET" || method === "HEAD") return await fetch(input, init);
    throw e;
  }
};
