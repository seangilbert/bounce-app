import { Agent, fetch as undiciFetch } from "undici";

/**
 * Server-side fetch for the Supabase clients: HTTP/1.1 only, one retry on
 * network failure for reads.
 *
 * Why not the global fetch: Node's built-in fetch negotiates HTTP/2 with
 * Supabase's Cloudflare front, and a long-lived process (dev server, warm
 * lambda) that holds a pooled h2 session past an idle close starts throwing
 * `TypeError: fetch failed` (cause ERR_HTTP2_INVALID_SESSION) on EVERY
 * request — the pool keeps handing back the same dead session, so retries
 * can't help and only a process restart recovers. Seen live as persistent
 * `listMembershipsForUser failed: TypeError: fetch failed` while curl and
 * fresh Node processes reached Supabase fine.
 *
 * Using undici's own fetch with an explicit `allowH2: false` agent pins the
 * connection pool to HTTP/1.1, whose per-connection keep-alive failures are
 * recoverable by the single read retry below. This also bypasses Next's
 * fetch patching, so responses are never served from the Data Cache — the
 * same guarantee `cache: "no-store"` used to provide.
 *
 * Reads only on the retry: a write whose socket died after send may have been
 * applied, so non-idempotent methods still fail fast.
 */
const h1Agent = new Agent({ allowH2: false });

export const resilientFetch: typeof fetch = async (input, init) => {
  const doFetch = () =>
    undiciFetch(input as Parameters<typeof undiciFetch>[0], {
      ...(init as Parameters<typeof undiciFetch>[1]),
      dispatcher: h1Agent,
    }) as unknown as Promise<Response>;
  try {
    return await doFetch();
  } catch (e) {
    // "fetch failed" hides the real network error — surface it for diagnosis.
    const cause = e instanceof Error ? (e.cause as { code?: string; message?: string } | undefined) : undefined;
    console.warn(
      `[supabase fetch] network failure: ${cause?.code ?? cause?.message ?? String(e)} — retrying reads once`,
    );
    const method = (
      init?.method ?? (input instanceof Request ? input.method : "GET")
    ).toUpperCase();
    if (method === "GET" || method === "HEAD") return await doFetch();
    throw e;
  }
};
