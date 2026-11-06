import { randomUUID } from "node:crypto";
import { requireAdmin } from "@/lib/adminAuth";
import { validateNewPatient } from "@/lib/adminPatients";
import { getSql, rowToResident } from "@/lib/db";
import { INVALID_JSON, readJson } from "../../alert/validate";

// POST /api/admin/residents: Charge view "Add resident". Header x-admin-secret.
// Body: { name, room, language: "en"|"fr"|"es", canSpeak: boolean, nurseId }
// Creates an active (non-guest) resident; clinical fields get neutral demo defaults.

const DEMO_CONTACT = JSON.stringify({ name: "Not on file", relation: "—", phone: "—" });

export async function POST(req: Request) {
  const denied = requireAdmin(req, "residents", 30);
  if (denied) return denied;
  const body = await readJson(req);
  if (body === INVALID_JSON) return Response.json({ error: "Invalid JSON" }, { status: 400 });
  const checked = validateNewPatient(body);
  if (!checked.ok) return Response.json({ error: checked.error, field: checked.field }, { status: 400 });
  const p = checked.value;

  try {
    const sql = getSql();
    const [nurse] = await sql`SELECT id, wing FROM nurses WHERE id = ${p.nurseId} AND role <> 'Charge'`;
    if (!nurse) return Response.json({ error: "Choose a nurse from the list.", field: "nurseId" }, { status: 400 });
    const [taken] = await sql`SELECT 1 FROM residents WHERE active AND lower(room) = lower(${p.room})`;
    if (taken) return Response.json({ error: `Room ${p.room} already has a resident. Pick another room.`, field: "room" }, { status: 409 });

    const wing = nurse.wing === "South" ? "South" : "North";
    const id = `p-${randomUUID().slice(0, 8)}`;
    const now = Date.now();
    const [row] = await sql`
      INSERT INTO residents (
        id, name, room, wing, language, can_speak, assigned_nurse_id, age, code_status, fall_risk,
        mobility, cognition, allergies, care_notes, emergency_contact, status, heart_rate,
        last_motion_at, is_guest, active, created_at)
      VALUES (
        ${id}, ${p.name}, ${p.room}, ${wing}, ${p.language}, ${p.canSpeak}, ${p.nurseId}, 80, 'Full code', 'Low',
        'Independent', 'Oriented', '{}', 'Added from the Charge view (demo).', ${DEMO_CONTACT}::jsonb, 'ok', 72,
        ${now}, FALSE, TRUE, ${now})
      RETURNING id, name, room, wing, language, can_speak, assigned_nurse_id, age, code_status, fall_risk,
                mobility, cognition, allergies, care_notes, emergency_contact, status, heart_rate,
                last_motion_at, motion_state, is_guest, active, created_at`;
    return Response.json({ resident: rowToResident(row) }, { status: 201 });
  } catch (err) {
    console.error("POST /api/admin/residents failed:", err);
    return Response.json({ error: "Could not add the resident. Try again." }, { status: 500 });
  }
}
