import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import { clientIp, peekLimit, rateLimit, tooManyRequests } from "./rateLimit";

// Shared guard for /api/admin/**: header `x-admin-secret: <DEMO_ADMIN_SECRET>`.
// Order: per-route rate limit → open mode? → secret configured? → failed-attempt limit (5/min/IP across
// all admin routes, checked BEFORE comparing) → constant-time compare. Wrong secrets count toward the fail limit.
// ADMIN_OPEN=1 (demo only) skips the secret; rate limits, validation and confirm dialogs still apply.

/** True when the server runs with ADMIN_OPEN=1: admin actions need no secret. */
export function adminOpen(): boolean {
  return process.env.ADMIN_OPEN === "1";
}

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
  const ip = clientIp(req);
  const wait = rateLimit(`admin:${route}:${ip}`, perMinute, WINDOW_MS);
  if (wait) return tooManyRequests(wait);
  if (adminOpen()) return null;
  const expected = process.env.DEMO_ADMIN_SECRET;
  if (!expected) {
    return Response.json({ error: "Admin actions are turned off: DEMO_ADMIN_SECRET is not set" }, { status: 503 });
  }
  const failWait = peekLimit(`admin-fail:${ip}`, FAIL_LIMIT, WINDOW_MS);
  if (failWait) return tooManyRequests(failWait);
  const given = req.headers.get("x-admin-secret") ?? "";
  if (given.length === 0 || given.length > 256 || !secretMatches(given, expected)) {
    rateLimit(`admin-fail:${ip}`, FAIL_LIMIT, WINDOW_MS);
    return Response.json({ error: "Wrong admin secret" }, { status: 401 });
  }
  return null;
}
