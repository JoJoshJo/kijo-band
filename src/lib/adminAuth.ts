import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import { clientIp, peekLimit, rateLimit, tooManyRequests } from "./rateLimit";

// Shared guard for /api/admin/** — header `x-admin-secret: <DEMO_ADMIN_SECRET>`.
// Order: secret configured? → per-route rate limit → failed-attempt limit (5/min/IP across all admin
// routes, checked BEFORE comparing) → constant-time compare. Wrong secrets count toward the fail limit.

const FAIL_LIMIT = 5;
const WINDOW_MS = 60_000;

function secretMatches(given: string, expected: string): boolean {
  // Hash both so lengths match and the comparison is constant-time.
  const a = createHash("sha256").update(given).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

/** Returns an error Response if the request may not proceed, or null if it is an authorized admin. */
export function requireAdmin(req: Request, route: string, perMinute: number): Response | null {
  const expected = process.env.DEMO_ADMIN_SECRET;
  if (!expected) {
    return Response.json({ error: "DEMO_ADMIN_SECRET is not configured on the server" }, { status: 503 });
  }
  const ip = clientIp(req);
  const wait = rateLimit(`admin:${route}:${ip}`, perMinute, WINDOW_MS) ?? peekLimit(`admin-fail:${ip}`, FAIL_LIMIT, WINDOW_MS);
  if (wait) return tooManyRequests(wait);
  const given = req.headers.get("x-admin-secret") ?? "";
  if (given.length === 0 || given.length > 256 || !secretMatches(given, expected)) {
    rateLimit(`admin-fail:${ip}`, FAIL_LIMIT, WINDOW_MS);
    return Response.json({ error: "Wrong admin secret" }, { status: 401 });
  }
  return null;
}
