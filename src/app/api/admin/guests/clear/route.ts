import { requireAdmin } from "@/lib/adminAuth";
import { getSql } from "@/lib/db";
import { freeIdleNurses } from "../../residents/nurseStatus";

// POST /api/admin/guests/clear: Charge view "Clear joined residents". Header x-admin-secret.
// Deletes every QR guest (their alerts cascade) and frees nurses who were on those alerts.

export async function POST(req: Request) {
  const denied = requireAdmin(req, "guests-clear", 10);
  if (denied) return denied;
  try {
    const sql = getSql();
    const [guests] = await sql.transaction([
      sql`DELETE FROM residents WHERE is_guest = TRUE RETURNING id`,
      freeIdleNurses(sql),
    ]);
    return Response.json({ ok: true, guestsDeleted: guests.length });
  } catch (err) {
    console.error("POST /api/admin/guests/clear failed:", err);
    return Response.json({ error: "Could not clear joined residents. Try again." }, { status: 500 });
  }
}
