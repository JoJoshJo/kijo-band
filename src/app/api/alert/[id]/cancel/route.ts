import { after, type NextRequest } from "next/server";
import { getSql, rowToAlert } from "@/lib/db";
import { sendResidentOkPush } from "@/lib/notify";
import { RESIDENT_OK_SUFFIX } from "@/lib/detection/alertRules";
import { INVALID_JSON, isObject, isResidentId, readJson } from "../../validate";

const ALERT_ID_RE = /^[A-Za-z0-9-]{1,64}$/;
const CANCEL_MIN_INTERVAL_MS = 2000;
const lastCancelByResident = new Map<string, number>(); // per-instance, like /api/heartbeat

// POST /api/alert/:id/cancel { residentId } — the band's "I'm OK – cancel".
// Only the resident's own alert. P2/P3: resolved (resident status recalculated with the shared rule,
// nurse freed if they have nothing else acknowledged). P1: never resolved — fall protocol says a nurse
// must still check — so the summary gets " · Resident says OK" and nurses get a follow-up push.
// Returns { result: "cancelled" | "flagged" | "already_resolved", changed }.
export async function POST(request: NextRequest, ctx: RouteContext<"/api/alert/[id]/cancel">) {
  const { id } = await ctx.params;
  if (!ALERT_ID_RE.test(id)) return Response.json({ error: "Invalid alert id" }, { status: 400 });
  const body = await readJson(request);
  if (body === INVALID_JSON || !isObject(body)) return Response.json({ error: "Invalid JSON" }, { status: 400 });
  const { residentId } = body;
  if (!isResidentId(residentId)) return Response.json({ error: "Invalid residentId" }, { status: 400 });

  const now = Date.now();
  const last = lastCancelByResident.get(residentId) ?? 0;
  if (now - last < CANCEL_MIN_INTERVAL_MS) {
    return Response.json({ error: "Too many requests" }, { status: 429, headers: { "Retry-After": "2" } });
  }
  lastCancelByResident.set(residentId, now);

  try {
    const sql = getSql();
    // Scoped to the resident: a band can only cancel its own alerts (same 404 for "not yours").
    const [row] = await sql`
      SELECT a.priority, a.status, a.summary, a.ack_token, r.name, r.room
      FROM alerts a JOIN residents r ON r.id = a.resident_id
      WHERE a.id = ${id} AND a.resident_id = ${residentId} AND r.active`;
    if (!row) return Response.json({ error: "Alert not found" }, { status: 404 });
    if (row.status === "resolved") return Response.json({ ok: true, result: "already_resolved", changed: false });

    if (Number(row.priority) === 1) {
      const flagged = await sql`
        UPDATE alerts SET summary = summary || ${RESIDENT_OK_SUFFIX}
        WHERE id = ${id} AND status <> 'resolved'
          AND RIGHT(summary, ${RESIDENT_OK_SUFFIX.length}) <> ${RESIDENT_OK_SUFFIX}
        RETURNING id, resident_id, type, priority, summary, transcript, heart_rate, assigned_nurse_id,
                  escalated_to, assisting_nurse_ids, status, created_at, acknowledged_at, resolved_at,
                  patient_message`;
      if (flagged.length > 0) {
        const alert = rowToAlert(flagged[0]);
        const resident = { name: row.name as string, room: row.room as string };
        after(() => sendResidentOkPush({ alert, resident, ackToken: row.ack_token as string }));
      }
      return Response.json({ ok: true, result: "flagged", changed: flagged.length > 0 });
    }

    const [cancelled] = await sql.transaction([
      sql`UPDATE alerts SET status = 'resolved', resolved_at = ${now}
          WHERE id = ${id} AND resident_id = ${residentId} AND status <> 'resolved'
          RETURNING assigned_nurse_id, escalated_to`,
      // Shared rule: resident status follows their remaining active alerts.
      sql`UPDATE residents SET status = (
            SELECT CASE
              WHEN MIN(priority) IS NULL THEN 'ok'
              WHEN MIN(priority) = 1 THEN 'emergency'
              ELSE 'attention' END
            FROM alerts WHERE resident_id = ${residentId} AND status <> 'resolved')
          WHERE id = ${residentId}`,
      // Free the nurse(s) on this alert unless they still have another acknowledged alert.
      sql`UPDATE nurses n SET status = 'available'
          WHERE n.status = 'responding'
            AND n.id IN (SELECT assigned_nurse_id FROM alerts WHERE id = ${id}
                         UNION SELECT escalated_to FROM alerts WHERE id = ${id} AND escalated_to IS NOT NULL)
            AND NOT EXISTS (SELECT 1 FROM alerts o
                            WHERE o.status = 'acknowledged' AND o.id <> ${id}
                              AND (o.assigned_nurse_id = n.id OR o.escalated_to = n.id))`,
    ]);
    return Response.json({ ok: true, result: "cancelled", changed: cancelled.length > 0 });
  } catch (err) {
    console.error("/api/alert/cancel failed:", err instanceof Error ? err.message : err);
    return Response.json({ error: "Failed to cancel" }, { status: 500 });
  }
}
