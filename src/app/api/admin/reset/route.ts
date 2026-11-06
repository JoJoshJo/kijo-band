import { createHash, timingSafeEqual } from "node:crypto";
import { getSql } from "@/lib/db";
import { clientIp, rateLimit, tooManyRequests } from "@/lib/rateLimit";

// POST /api/admin/reset — clears all alerts and guest residents, resets resident + nurse statuses.
// Requires header `x-admin-secret: <DEMO_ADMIN_SECRET>`.

function secretMatches(given: string, expected: string): boolean {
  // Hash both so lengths match and comparison is constant-time.
  const a = createHash("sha256").update(given).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

export async function POST(req: Request) {
  const expected = process.env.DEMO_ADMIN_SECRET;
  if (!expected) {
    return Response.json({ error: "DEMO_ADMIN_SECRET is not configured on the server" }, { status: 503 });
  }
  // Brute-force guard: 5 attempts per minute per IP (checked before the secret is compared).
  const wait = rateLimit(`admin-reset:${clientIp(req)}`, 5, 60_000);
  if (wait) return tooManyRequests(wait);
  const given = req.headers.get("x-admin-secret") ?? "";
  if (given.length === 0 || given.length > 256 || !secretMatches(given, expected)) {
    return Response.json({ error: "Wrong admin secret" }, { status: 401 });
  }

  try {
    const sql = getSql();
    const [alerts, guests] = await sql.transaction([
      sql`DELETE FROM alerts RETURNING id`,
      sql`DELETE FROM residents WHERE is_guest = TRUE RETURNING id`,
      sql`UPDATE residents SET status = 'ok'`,
      sql`UPDATE nurses SET status = 'available'`,
    ]);
    return Response.json({ ok: true, alertsDeleted: alerts.length, guestsDeleted: guests.length });
  } catch (err) {
    console.error("POST /api/admin/reset failed:", err);
    return Response.json({ error: "Reset failed" }, { status: 500 });
  }
}
