/**
 * Distributed rate limiter backed by Upstash Redis, so a limit is shared across
 * every serverless instance instead of counted per-process. Falls back to a
 * per-instance in-memory limiter when Upstash isn't configured (e.g. local dev
 * without the `KV_*` vars) or when a Redis call fails — so limits degrade to
 * "soft, per-instance" rather than erroring the request.
 *
 * Call shape is unchanged except it's now async: `await checkRateLimit(key,
 * limit, windowMs)`.
 */
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  /** Epoch ms when the window resets (for a Retry-After header). */
  resetAt: number;
}

// ── Upstash (shared / distributed) ───────────────────────────────────────────
// The Vercel Marketplace Upstash integration injects KV_REST_API_URL/TOKEN.
const redisUrl = process.env.KV_REST_API_URL;
const redisToken = process.env.KV_REST_API_TOKEN;
const redis = redisUrl && redisToken ? new Redis({ url: redisUrl, token: redisToken }) : null;

// Each (limit, window) pair needs its own Ratelimit; build + cache once. Callers
// pass the full namespaced key (e.g. "quote:<ip>") as the identifier, so two
// endpoints that happen to share a limit still keep separate counters.
const limiters = new Map<string, Ratelimit>();
function getLimiter(limit: number, windowMs: number): Ratelimit {
  const cacheKey = `${limit}:${windowMs}`;
  let rl = limiters.get(cacheKey);
  if (!rl) {
    rl = new Ratelimit({
      redis: redis!,
      limiter: Ratelimit.slidingWindow(limit, `${windowMs} ms`),
      prefix: "rl",
      // Short-circuits an already-blocked identifier without a Redis round-trip.
      ephemeralCache: new Map(),
    });
    limiters.set(cacheKey, rl);
  }
  return rl;
}

// ── In-memory fallback (per-instance) ────────────────────────────────────────
type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();
const MAX_KEYS = 10_000;

function checkInMemory(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();

  // Opportunistically prune expired entries if the map grows large.
  if (buckets.size > MAX_KEYS) {
    for (const [k, b] of buckets) {
      if (now >= b.resetAt) buckets.delete(k);
    }
  }

  const bucket = buckets.get(key);
  if (!bucket || now >= bucket.resetAt) {
    const resetAt = now + windowMs;
    buckets.set(key, { count: 1, resetAt });
    return { allowed: true, remaining: limit - 1, resetAt };
  }

  if (bucket.count >= limit) {
    return { allowed: false, remaining: 0, resetAt: bucket.resetAt };
  }

  bucket.count += 1;
  return { allowed: true, remaining: limit - bucket.count, resetAt: bucket.resetAt };
}

/**
 * Consume one token for `key` within a `limit`-per-`windowMs` fixed budget.
 * Uses Upstash when configured; otherwise (or on Redis failure) the in-memory
 * backstop.
 */
export async function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number,
): Promise<RateLimitResult> {
  if (!redis) return checkInMemory(key, limit, windowMs);
  try {
    const res = await getLimiter(limit, windowMs).limit(key);
    return { allowed: res.success, remaining: res.remaining, resetAt: res.reset };
  } catch (err) {
    console.error("[rate-limit] Upstash error — falling back to in-memory:", err);
    return checkInMemory(key, limit, windowMs);
  }
}
