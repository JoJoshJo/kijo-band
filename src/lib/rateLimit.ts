import "server-only";

// Small fixed-window rate limiter, in memory per server instance (best effort on serverless —
// same approach as /api/heartbeat). Limits are generous: at a venue many people share one NAT IP.

const buckets = new Map<string, { start: number; count: number }>();
const MAX_KEYS = 5000;

export function clientIp(req: Request): string {
  // Vercel sets x-real-ip / x-forwarded-for; locally there is neither.
  return (
    req.headers.get("x-real-ip") ?? req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local"
  );
}

/** Returns null if allowed, or the seconds to wait if this key used up its `limit` within `windowMs`. */
export function rateLimit(key: string, limit: number, windowMs: number): number | null {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || now - b.start >= windowMs) {
    if (buckets.size >= MAX_KEYS) buckets.clear(); // bounded memory
    buckets.set(key, { start: now, count: 1 });
    return null;
  }
  if (b.count >= limit) return Math.max(1, Math.ceil((b.start + windowMs - now) / 1000));
  b.count += 1;
  return null;
}

export function tooManyRequests(retryAfterSec: number): Response {
  return Response.json(
    { error: "Too many requests" },
    { status: 429, headers: { "Retry-After": String(retryAfterSec) } },
  );
}
