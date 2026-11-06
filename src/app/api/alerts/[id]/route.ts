import type { NextRequest } from "next/server";
import { getSql, rowToAlert } from "@/lib/db";

// PATCH /api/alerts/:id — dashboard actions on an alert.
// Body: { action: "acknowledge" } | { action: "resolve" } | { action: "assist", nurseId: string }

const ID_RE = /^[A-Za-z0-9-]{1,64}$/;
const ACTIONS = ["acknowledge", "resolve", "assist"] as const;
type Action = (typeof ACTIONS)[number];

const ALERT_COLUMNS = `id, resident_id, type, priority, summary, transcript, heart_rate, assigned_nurse_id,
  escalated_to, assisting_nurse_ids, status, created_at, acknowledged_at, resolved_at, patient_message`;

function bad(status: number, error: string) {
  return Response.json({ error }, { status });
}

export async function PATCH(req: NextRequest, ctx: RouteContext<"/api/alerts/[id]">) {
  const { id } = await ctx.params;
  if (!ID_RE.test(id)) return bad(400, "Invalid alert id");

  const body: unknown = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return bad(400, "Body must be a JSON object");
  const { action, nurseId } = body as { action?: unknown; nurseId?: unknown };
  if (typeof action !== "string" || !ACTIONS.includes(action as Action)) {
    return bad(400, `action must be one of: ${ACTIONS.join(", ")}`);
  }
  if (nurseId !== undefined && (typeof nurseId !== "string" || !ID_RE.test(nurseId))) {
    return bad(400, "Invalid nurseId");
  }

  try {
    const sql = getSql();
    const now = Date.now();

    const [alert] = await sql`
      SELECT id, status, priority, resident_id, assigned_nurse_id, assisting_nurse_ids
      FROM alerts WHERE id = ${id}`;
    if (!alert) return bad(404, "Alert not found");
    if (alert.status === "resolved") return bad(409, "Alert is already resolved");

    const residentId = alert.resident_id as string;
    const assignedNurseId = alert.assigned_nurse_id as string;

    switch (action as Action) {
      case "acknowledge": {
        if (alert.status === "open") {
          await sql.transaction([
            sql`UPDATE alerts SET status = 'acknowledged', acknowledged_at = ${now}
                WHERE id = ${id} AND status = 'open'`,
            sql`UPDATE nurses SET status = 'responding' WHERE id = ${assignedNurseId}`,
          ]);
        }
        break; // already acknowledged → idempotent no-op
      }

      case "resolve": {
        await sql.transaction([
          sql`UPDATE alerts SET status = 'resolved', resolved_at = ${now}
              WHERE id = ${id} AND status <> 'resolved'`,
          // Resident status follows their remaining active alerts.
          sql`UPDATE residents SET status = (
                SELECT CASE
                  WHEN MIN(priority) IS NULL THEN 'ok'
                  WHEN MIN(priority) = 1 THEN 'emergency'
                  ELSE 'attention' END
                FROM alerts WHERE resident_id = ${residentId} AND status <> 'resolved')
              WHERE id = ${residentId}`,
          // Free the nurse(s) on this alert — assigned and, if escalated, the charge nurse — unless
          // they still have another acknowledged alert (same rule as /api/alert/[id]/cancel).
          sql`UPDATE nurses n SET status = 'available'
              WHERE n.status = 'responding'
                AND n.id IN (SELECT assigned_nurse_id FROM alerts WHERE id = ${id}
                             UNION SELECT escalated_to FROM alerts WHERE id = ${id} AND escalated_to IS NOT NULL)
                AND NOT EXISTS (SELECT 1 FROM alerts o
                                WHERE o.status = 'acknowledged' AND o.id <> ${id}
                                  AND (o.assigned_nurse_id = n.id OR o.escalated_to = n.id))`,
        ]);
        break;
      }

      case "assist": {
        if (Number(alert.priority) !== 1) return bad(400, "Assist is only available on P1 alerts");
        if (!nurseId) return bad(400, "nurseId is required for assist");
        if (nurseId === assignedNurseId) return bad(400, "Assigned nurse cannot assist their own alert");
        const [nurse] = await sql`SELECT id FROM nurses WHERE id = ${nurseId}`;
        if (!nurse) return bad(400, "Unknown nurseId");
        await sql`UPDATE alerts SET assisting_nurse_ids = array_append(assisting_nurse_ids, ${nurseId})
                  WHERE id = ${id} AND status <> 'resolved'
                    AND NOT (${nurseId} = ANY(assisting_nurse_ids))`;
        break;
      }
    }

    const [updated] = await sql.query(`SELECT ${ALERT_COLUMNS} FROM alerts WHERE id = $1`, [id]);
    return Response.json({ alert: rowToAlert(updated) });
  } catch (err) {
    console.error(`PATCH /api/alerts/${id} failed:`, err);
    return bad(500, "Failed to update alert");
  }
}
