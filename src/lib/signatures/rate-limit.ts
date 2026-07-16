/**
 * Rate limiting for the public signing routes.
 *
 * In-memory, no external service — that was the constraint, and for this threat
 * model it is enough. The public routes are reached by one client, a handful of
 * times, from a link only they were given.
 *
 * WHAT THIS IS AND IS NOT
 *   It is a brake on someone hammering /sign/<token> with guesses or replaying a
 *   sign request in a loop.
 *
 *   It is NOT a defence against a distributed attacker, and it does not survive
 *   a restart or span instances: on serverless each instance keeps its own
 *   counters, so the real limit is roughly (configured limit x instances). That
 *   is a documented weakness, not an oversight.
 *
 *   The thing actually protecting a token is its 256 bits of entropy. Guessing
 *   one is not a rate-limiting problem — it is arithmetic, and the arithmetic
 *   says never. This exists to stop noise and to make abuse visible, not to be
 *   the wall.
 */

interface Bucket {
  count: number;
  /** Epoch ms when this window resets. */
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

/** Stop the map growing forever on a long-lived server. */
const MAX_BUCKETS = 10_000;

export interface RateLimitRule {
  /** Requests allowed per window. */
  limit: number;
  /** Window length in ms. */
  windowMs: number;
}

/**
 * The rules, tuned to what each route is for.
 *
 * `view` is generous: a signer legitimately reloads, switches devices, comes back
 * tomorrow. `sign` is tight: it should happen once, ever, and anything past a
 * couple of attempts is either a bug or an attack.
 */
export const RULES = {
  view: { limit: 60, windowMs: 60_000 },
  sign: { limit: 5, windowMs: 60_000 },
  decline: { limit: 5, windowMs: 60_000 },
} as const satisfies Record<string, RateLimitRule>;

export interface RateLimitResult {
  allowed: boolean;
  /** Seconds until the window resets. For the Retry-After header. */
  retryAfter: number;
  remaining: number;
}

/**
 * Counts a request against a key.
 *
 * The key should combine the route and the caller's IP. Never the token: keying
 * by token would let an attacker with many tokens bypass the limit entirely, and
 * would put a secret into a data structure that outlives the request.
 */
export function checkRateLimit(key: string, rule: RateLimitRule): RateLimitResult {
  const now = Date.now();
  const existing = buckets.get(key);

  if (!existing || existing.resetAt <= now) {
    if (buckets.size >= MAX_BUCKETS) evictExpired(now);
    buckets.set(key, { count: 1, resetAt: now + rule.windowMs });
    return { allowed: true, retryAfter: 0, remaining: rule.limit - 1 };
  }

  existing.count += 1;

  if (existing.count > rule.limit) {
    return {
      allowed: false,
      retryAfter: Math.ceil((existing.resetAt - now) / 1000),
      remaining: 0,
    };
  }

  return { allowed: true, retryAfter: 0, remaining: rule.limit - existing.count };
}

/**
 * Drops expired buckets, and if that is not enough, the oldest ones.
 *
 * Evicting a live bucket resets someone's counter early — a small correctness
 * loss that beats an unbounded map. It only happens under 10k concurrent keys,
 * which this application will not see.
 */
function evictExpired(now: number): void {
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
  if (buckets.size < MAX_BUCKETS) return;

  const sorted = Array.from(buckets.entries()).sort((a, b) => a[1].resetAt - b[1].resetAt);
  for (let i = 0; i < Math.ceil(MAX_BUCKETS / 10); i++) {
    if (sorted[i]) buckets.delete(sorted[i][0]);
  }
}

/**
 * The caller's IP, as well as it can be known.
 *
 * x-forwarded-for is client-controlled unless a trusted proxy overwrites it,
 * which is exactly what Vercel and most hosts do. Behind such a proxy the first
 * entry is real; without one, none of this is trustworthy — which is why the IP
 * is only ever used for rate limiting and for an audit record that says "this is
 * what the request claimed", never for an access decision.
 */
export function clientIp(headers: Headers): string | null {
  const forwarded = headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }
  return headers.get('x-real-ip')?.trim() || null;
}

/** Truncated so an audit row cannot become an unbounded blob. */
export function clientUserAgent(headers: Headers): string | null {
  const ua = headers.get('user-agent');
  if (!ua) return null;
  return ua.length > 500 ? ua.slice(0, 500) : ua;
}
