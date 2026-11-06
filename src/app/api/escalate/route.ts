import { getSql, rowToAlert } from "@/lib/db";
import { sendNtfy } from "@/lib/notify";

// POST /api/escalate { alertId } — called by the dashboard when an OPEN alert's 90s ring runs out.
// Idempotent: escalates at most once, only while the alert is still open, and only after 90s.

const ID_RE = /^[A-Za-z0-9-]{1,64}$/;
const ESCALATE_AFTER_MS = 90_000;
const CLOCK_TOLERANCE_MS = 2_000; // dashboard clock may run slightly ahead of the server

const ALERT_COLUMNS = `id, resident_id, type, priority, summary, transcript, heart_rate, assigned_nurse_id,
  escalated_to, assisting_nurse_ids, status, created_at, acknowledged_at, resolved_at, patient_message`;

export async function POST(req: Request) {
  const body: unknown = await req.json().catch(() => null);
  const alertId = body && typeof body === "object" ? (body as { alertId?: unknown }).alertId : undefined;
  if (typeof alertId !== "string" || !ID_RE.test(alertId)) {
    return Response.json({ error: "alertId is required" }, { status: 400 });
  }

  try {
    const sql = getSql();
    const cutoff = Date.now() - ESCALATE_AFTER_MS + CLOCK_TOLERANCE_MS;

    // Single conditional UPDATE → safe if several dashboards fire at once.
    const updated = await sql.query(
      `UPDATE alerts
       SET escalated_to = (SELECT id FROM nurses WHERE role = 'Charge' ORDER BY id LIMIT 1)
       WHERE id = $1 AND status = 'open' AND escalated_to IS NULL AND created_at <= $2
         AND EXISTS (SELECT 1 FROM nurses WHERE role = 'Charge')
       RETURNING ${ALERT_COLUMNS}`,
      [alertId, cutoff],
    );

    if (updated.length > 0) {
      const alert = rowToAlert(updated[0]);
      // Second push, tagged ⚠️ ESCALATED. Only the request that won the UPDATE sends it, so never twice.
      // Awaited so serverless doesn't cut it off; sendNtfy never throws and times out after 3s.
      await sendNtfy({ alert, escalated: true });
      return Response.json({ escalated: true, alert });
    }

    const [current] = await sql.query(`SELECT ${ALERT_COLUMNS} FROM alerts WHERE id = $1`, [alertId]);
    if (!current) return Response.json({ error: "Alert not found" }, { status: 404 });
    // Already escalated, acknowledged/resolved, or not yet due → no-op.
    return Response.json({ escalated: false, alert: rowToAlert(current) });
  } catch (err) {
    console.error("POST /api/escalate failed:", err);
    return Response.json({ error: "Failed to escalate" }, { status: 500 });
  }
}
