import { connection, type NextRequest } from "next/server";
import { getSql, rowToAlert } from "@/lib/db";
import type { Alert } from "@/lib/types";

// GET /api/residents/:id/history → last 5 alerts (incl. resolved), newest first, with response times.
export type AlertHistoryItem = Alert & {
  responseMs: number | null; // acknowledged_at − created_at; null if never acknowledged
};

const ID_RE = /^[A-Za-z0-9-]{1,64}$/;

export async function GET(_req: NextRequest, ctx: RouteContext<"/api/residents/[id]/history">) {
  await connection();
  const { id } = await ctx.params;
  if (!ID_RE.test(id)) return Response.json({ error: "Invalid resident id" }, { status: 400 });

  try {
    const sql = getSql();
    const rows = await sql`
      SELECT id, resident_id, type, priority, summary, transcript, heart_rate, assigned_nurse_id,
             escalated_to, assisting_nurse_ids, status, created_at, acknowledged_at, resolved_at, patient_message
      FROM alerts
      WHERE resident_id = ${id}
      ORDER BY created_at DESC
      LIMIT 5`;
    const alerts: AlertHistoryItem[] = rows.map((r) => {
      const a = rowToAlert(r);
      return { ...a, responseMs: a.acknowledgedAt != null ? a.acknowledgedAt - a.createdAt : null };
    });
    return Response.json({ alerts }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error(`GET /api/residents/${id}/history failed:`, err);
    return Response.json({ error: "Failed to load history" }, { status: 500 });
  }
}
