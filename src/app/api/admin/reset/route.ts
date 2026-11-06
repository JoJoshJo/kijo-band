import { getSql } from "@/lib/db";
import { requireAdmin } from "@/lib/adminAuth";

// POST /api/admin/reset — clears all alerts and guest residents, restores removed residents (active),
// resets resident + nurse statuses.
// Requires header `x-admin-secret: <DEMO_ADMIN_SECRET>`.

export async function POST(req: Request) {
  // 5 resets per minute per IP; wrong secrets also count toward the shared admin fail limit.
  const denied = requireAdmin(req, "reset", 5);
  if (denied) return denied;

  try {
    const sql = getSql();
    const [alerts, guests] = await sql.transaction([
      sql`DELETE FROM alerts RETURNING id`,
      sql`DELETE FROM residents WHERE is_guest = TRUE RETURNING id`,
      sql`UPDATE residents SET status = 'ok', active = TRUE`,
      sql`UPDATE nurses SET status = 'available'`,
    ]);
    return Response.json({ ok: true, alertsDeleted: alerts.length, guestsDeleted: guests.length });
  } catch (err) {
    console.error("POST /api/admin/reset failed:", err);
    return Response.json({ error: "Reset failed" }, { status: 500 });
  }
}
