import { vi } from "vitest";

/** One `{ data, error }` result the mock returns for a query/rpc, in call order. */
export interface QueuedResponse {
  data: unknown;
  error?: unknown;
}

/**
 * A chainable + thenable stub of the Supabase query builder for unit tests.
 *
 * Filter/modifier methods (`select`/`eq`/`ilike`/`in`/`order`/…) return the
 * builder so chains work. A query resolves the *next queued response* when it's
 * awaited — either directly (list queries: `await from().select().in(...)`) or
 * via a terminal `.maybeSingle()`/`.single()`. `rpc()` also consumes one.
 *
 * Responses are consumed strictly in call order, so queue them to match the
 * exact sequence of DB round-trips the code under test performs.
 */
export function makeSupabaseMock(responses: QueuedResponse[]) {
  let i = 0;
  const next = (): QueuedResponse => responses[i++] ?? { data: null, error: null };

  const builder: Record<string, unknown> = {};
  const chain = () => builder;
  for (const m of [
    "select", "eq", "neq", "ilike", "in", "order", "gte", "lte", "lt", "gt", "is", "not",
    "limit", "range", "contains",
    // Writes chain the same way: `update(patch).eq(...).is(...).select()`.
    "update", "insert", "upsert", "delete",
  ]) {
    builder[m] = vi.fn(chain);
  }
  builder.maybeSingle = vi.fn(() => Promise.resolve(next()));
  builder.single = vi.fn(() => Promise.resolve(next()));
  // Thenable: `await from().select()...eq(...)` (no terminal) resolves here.
  builder.then = (resolve: (v: QueuedResponse) => unknown, reject: (e: unknown) => unknown) =>
    Promise.resolve(next()).then(resolve, reject);

  return {
    from: vi.fn(() => builder),
    rpc: vi.fn(() => Promise.resolve(next())),
    /**
     * The (shared) query builder, exposed so a test can assert on the FILTERS a
     * query applied — `expect(db.builder.in).toHaveBeenCalledWith("customer_id",
     * [...])`. For tenant-scoped reads the filter *is* the security control, so
     * asserting only on the returned rows would miss the thing that matters.
     */
    builder: builder as Record<string, ReturnType<typeof vi.fn>>,
  };
}
