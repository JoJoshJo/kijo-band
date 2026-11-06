import { createHash, timingSafeEqual } from "node:crypto";
import { getSql } from "@/lib/db";
import { clientIp, rateLimit, tooManyRequests } from "@/lib/rateLimit";

const ALERT_ID_RE = /^[A-Za-z0-9-]{1,64}$/;
const TOKEN_RE = /^[A-Za-z0-9_-]{16,128}$/;

/** Constant-time comparison; hashing first makes both inputs the same length. */
function tokensMatch(given: string, expected: string): boolean {
  const a = createHash("sha256").update(given).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

// Same answer for "no such alert" and "wrong token", so the endpoint can't be used to probe alert ids.
const forbidden = () => Response.json({ error: "Invalid alert or token" }, { status: 403 });

// POST /api/ack?alert=<id>&token=<ackToken> — the ntfy "I'm on it" action.
// Verifies the per-alert token, then open → acknowledged and the responding nurse → responding.
// Idempotent: repeating it (or acking an already acknowledged/resolved alert) changes nothing.
export async function POST(request: Request) {
  // Light per-IP limit: a nurse taps once; this only slows token guessing / hammering.
  const wait = rateLimit(`ack:${clientIp(request)}`, 30, 60_000);
  if (wait !== null) return tooManyRequests(wait);
  const url = new URL(request.url);
  const alertId = url.searchParams.get("alert") ?? "";
  const token = url.searchParams.get("token") ?? "";
  if (!ALERT_ID_RE.test(alertId) || !TOKEN_RE.test(token)) return forbidden();

  try {
    const sql = getSql();
    const [row] = await sql`SELECT ack_token, status FROM alerts WHERE id = ${alertId}`;
    if (!row || !tokensMatch(token, row.ack_token as string)) return forbidden();

    if (row.status !== "open") {
      return Response.json({ ok: true, status: row.status, changed: false });
    }

    // Conditional update → safe if the button is tapped on two phones at once.
    // The escalated-to (charge) nurse responds if the alert was escalated, else the assigned nurse.
    const now = Date.now();
    const updated = await sql`
      WITH a AS (
        UPDATE alerts SET status = 'acknowledged', acknowledged_at = ${now}
        WHERE id = ${alertId} AND status = 'open'
        RETURNING COALESCE(escalated_to, assigned_nurse_id) AS nurse_id
      ), n AS (
        UPDATE nurses SET status = 'responding'
        WHERE id = (SELECT nurse_id FROM a)
        RETURNING id, name
      )
      SELECT a.nurse_id, n.name FROM a LEFT JOIN n ON n.id = a.nurse_id`;

    if (updated.length === 0) {
      const [cur] = await sql`SELECT status FROM alerts WHERE id = ${alertId}`;
      return Response.json({ ok: true, status: cur?.status ?? "acknowledged", changed: false });
    }
    return Response.json({ ok: true, status: "acknowledged", changed: true, nurse: updated[0].name ?? null });
  } catch (err) {
    console.error("/api/ack failed:", err instanceof Error ? err.message : err);
    return Response.json({ error: "Failed to acknowledge" }, { status: 500 });
  }
}
