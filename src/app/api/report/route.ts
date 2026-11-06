import { connection } from "next/server";
import { getSql } from "@/lib/db";
import type { AlertPriority, AlertType } from "@/lib/types";

// GET /api/report → Night Report numbers over every alert in the DB (since the last demo reset).
export type NightReport = {
  total: number;
  byPriority: Record<AlertPriority, number>;
  acknowledged: number;
  stillOpen: number;
  avgAckMs: number | null;
  slowest: { room: string; name: string; type: AlertType; priority: AlertPriority; ackMs: number } | null;
  escalations: number;
};

export async function GET() {
  await connection();
  try {
    const sql = getSql();
    const [[agg], [slow]] = await Promise.all([
      sql`SELECT
            COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE priority = 1)::int AS p1,
            COUNT(*) FILTER (WHERE priority = 2)::int AS p2,
            COUNT(*) FILTER (WHERE priority = 3)::int AS p3,
            COUNT(*) FILTER (WHERE acknowledged_at IS NOT NULL)::int AS acknowledged,
            COUNT(*) FILTER (WHERE status = 'open')::int AS still_open,
            AVG(acknowledged_at - created_at) FILTER (WHERE acknowledged_at IS NOT NULL) AS avg_ack_ms,
            COUNT(*) FILTER (WHERE escalated_to IS NOT NULL)::int AS escalations
          FROM alerts`,
      sql`SELECT r.room, r.name, a.type, a.priority, (a.acknowledged_at - a.created_at) AS ack_ms
          FROM alerts a JOIN residents r ON r.id = a.resident_id
          WHERE a.acknowledged_at IS NOT NULL
          ORDER BY ack_ms DESC
          LIMIT 1`,
    ]);

    const report: NightReport = {
      total: agg.total,
      byPriority: { 1: agg.p1, 2: agg.p2, 3: agg.p3 },
      acknowledged: agg.acknowledged,
      stillOpen: agg.still_open,
      avgAckMs: agg.avg_ack_ms == null ? null : Math.round(Number(agg.avg_ack_ms)),
      slowest: slow
        ? {
            room: slow.room,
            name: slow.name,
            type: slow.type,
            priority: Number(slow.priority) as AlertPriority,
            ackMs: Number(slow.ack_ms),
          }
        : null,
      escalations: agg.escalations,
    };
    return Response.json(report, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("GET /api/report failed:", err);
    return Response.json({ error: "Failed to build report" }, { status: 500 });
  }
}
