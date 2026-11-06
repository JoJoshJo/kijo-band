import { connection } from "next/server";
import { getSql } from "@/lib/db";
import { clientIp, rateLimit, tooManyRequests } from "@/lib/rateLimit";
import type { AlertPriority, AlertType } from "@/lib/types";
import { buildFacts, ruleHandoff, type HandoffAlertRow, type HandoffNurse } from "./facts";
import { handoffWithClaude } from "./claude";

// POST /api/report/handoff → morning shift handoff over every alert since the last demo reset.
// Claude drafts the wording (8s budget, no retries); any failure falls back to the rule-based version.
// Every number shown comes from the DB, never from the model. No request body is read.
export async function POST(req: Request) {
  await connection();
  const wait = rateLimit(`handoff:${clientIp(req)}`, 5, 60_000);
  if (wait) return tooManyRequests(wait);
  try {
    const sql = getSql();
    const [rows, nurseRows] = await Promise.all([
      sql`SELECT a.resident_id, r.room, r.name, r.fall_risk, a.assigned_nurse_id, a.type, a.priority, a.status,
                 a.created_at, a.acknowledged_at, a.resolved_at, a.escalated_to, a.summary
          FROM alerts a JOIN residents r ON r.id = a.resident_id
          ORDER BY a.created_at`,
      sql`SELECT id, name, role FROM nurses ORDER BY id`,
    ]);
    const alerts: HandoffAlertRow[] = rows.map((r) => ({
      residentId: r.resident_id as string,
      room: r.room as string,
      name: r.name as string,
      fallRisk: r.fall_risk as string,
      nurseId: r.assigned_nurse_id as string,
      type: r.type as AlertType,
      priority: Number(r.priority) as AlertPriority,
      status: r.status as HandoffAlertRow["status"],
      createdAt: Number(r.created_at),
      acknowledgedAt: r.acknowledged_at == null ? null : Number(r.acknowledged_at),
      resolvedAt: r.resolved_at == null ? null : Number(r.resolved_at),
      escalatedTo: (r.escalated_to as string | null) ?? null,
      summary: (r.summary as string) ?? "",
    }));
    const nurses: HandoffNurse[] = nurseRows.map((n) => ({ id: n.id, name: n.name, role: n.role }));

    const facts = buildFacts(alerts, nurses);
    const now = Date.now();
    const handoff = (alerts.length ? await handoffWithClaude(facts, now) : null) ?? ruleHandoff(facts, now);
    return Response.json(handoff, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("POST /api/report/handoff failed:", err);
    return Response.json({ error: "Failed to build handoff" }, { status: 500 });
  }
}
