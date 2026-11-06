import type { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import { ID_RE, validatePatientAction } from "@/lib/adminPatients";
import { getSql } from "@/lib/db";
import { INVALID_JSON, readJson } from "../../../alert/validate";
import { freeIdleNurses } from "../nurseStatus";

// PATCH /api/admin/residents/:id — Charge view tile menu. Header x-admin-secret.
// { action: "move", nurseId } → reassigns the patient and their unresolved alerts.
// { action: "remove" }        → resolves their open alerts and frees nurses; demo residents are hidden
//                               (active = FALSE, restored by Reset), QR guests are deleted.

export async function PATCH(req: NextRequest, ctx: RouteContext<"/api/admin/residents/[id]">) {
  const denied = requireAdmin(req, "residents", 30);
  if (denied) return denied;
  const { id } = await ctx.params;
  if (!ID_RE.test(id)) return Response.json({ error: "Invalid resident id" }, { status: 400 });
  const body = await readJson(req);
  if (body === INVALID_JSON) return Response.json({ error: "Invalid JSON" }, { status: 400 });
  const checked = validatePatientAction(body);
  if (!checked.ok) return Response.json({ error: checked.error }, { status: 400 });
  const action = checked.value;

  try {
    const sql = getSql();
    const [resident] = await sql`SELECT id, is_guest FROM residents WHERE id = ${id} AND active`;
    if (!resident) return Response.json({ error: "This resident is no longer on the floor. Refresh the page." }, { status: 404 });

    if (action.action === "move") {
      const [nurse] = await sql`SELECT id FROM nurses WHERE id = ${action.nurseId} AND role <> 'Charge'`;
      if (!nurse) return Response.json({ error: "Choose a nurse from the list." }, { status: 400 });
      await sql.transaction([
        sql`UPDATE residents SET assigned_nurse_id = ${action.nurseId} WHERE id = ${id}`,
        sql`UPDATE alerts SET assigned_nurse_id = ${action.nurseId} WHERE resident_id = ${id} AND status <> 'resolved'`,
        freeIdleNurses(sql),
      ]);
      return Response.json({ ok: true, moved: id, nurseId: action.nurseId });
    }

    const now = Date.now();
    const [resolved] = await sql.transaction([
      sql`UPDATE alerts SET status = 'resolved', resolved_at = ${now}
          WHERE resident_id = ${id} AND status <> 'resolved' RETURNING id`,
      resident.is_guest
        ? sql`DELETE FROM residents WHERE id = ${id} AND is_guest`
        : sql`UPDATE residents SET active = FALSE, status = 'ok' WHERE id = ${id}`,
      freeIdleNurses(sql),
    ]);
    return Response.json({ ok: true, removed: id, deleted: !!resident.is_guest, alertsResolved: resolved.length });
  } catch (err) {
    console.error(`PATCH /api/admin/residents/${id} failed:`, err);
    return Response.json({ error: "Could not update the resident. Try again." }, { status: 500 });
  }
}
