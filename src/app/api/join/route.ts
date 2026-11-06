import { getSql } from "@/lib/db";
import type { Language } from "@/lib/types";
import { INVALID_JSON, isObject, readJson } from "../alert/validate";

const MAX_GUESTS = 15;
const GUEST_NURSE_ID = "n-chloe";
const DEVICE_ID_RE = /^[A-Za-z0-9_-]{16,64}$/;
const LANGS: readonly Language[] = ["en", "fr", "es"];
const NAME_MAX = 20;
const GUEST_CONTACT = JSON.stringify({ name: "Demo guest", relation: "—", phone: "—" });

/** Optional display name: trimmed, control characters removed, max 20 chars. undefined = invalid. */
function cleanName(v: unknown): string | null | undefined {
  if (v == null) return null;
  if (typeof v !== "string") return undefined;
  const s = v.replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e]/g, "").replace(/\s+/g, " ").trim();
  if (s.length > NAME_MAX) return undefined;
  return s.length ? s : null;
}

type GuestRow = { id: string; name: string; room: string; language: Language };
const toBody = (r: GuestRow, rejoined: boolean) => ({
  residentId: r.id,
  name: r.name,
  room: r.room,
  language: r.language,
  rejoined,
});

// POST /api/join { deviceId, name?, language } — QR guest flow (spec section 8).
// One guest resident per device (the random deviceId lives in the phone's localStorage): joining again
// from the same device returns the same guest. Guests go in the Guest wing (room G1, G2, …) with Nurse
// Chloe, capped at 15. Admin Reset deletes them, and numbering restarts at G1.
export async function POST(request: Request) {
  const body = await readJson(request);
  if (body === INVALID_JSON || !isObject(body)) return Response.json({ error: "Invalid JSON" }, { status: 400 });

  const { deviceId, language } = body;
  const name = cleanName(body.name);
  if (typeof deviceId !== "string" || !DEVICE_ID_RE.test(deviceId)) {
    return Response.json({ error: "Invalid deviceId" }, { status: 400 });
  }
  if (typeof language !== "string" || !LANGS.includes(language as Language)) {
    return Response.json({ error: "language must be en, fr or es" }, { status: 400 });
  }
  if (name === undefined) return Response.json({ error: `name must be at most ${NAME_MAX} characters` }, { status: 400 });

  try {
    const sql = getSql();

    // Same device again → same guest (update name/language if they changed).
    const [existing] = await sql`
      UPDATE residents SET language = ${language}, name = COALESCE(${name}, name)
      WHERE is_guest = TRUE AND device_id = ${deviceId}
      RETURNING id, name, room, language`;
    if (existing) return Response.json(toBody(existing as GuestRow, true));

    const now = Date.now();
    const heartRate = 62 + Math.floor(Math.random() * 19); // resting 62–80, like the seeded residents
    // Next free number and the cap are checked in the same statement; a concurrent join that picks the
    // same number hits ON CONFLICT and is retried.
    for (let attempt = 0; attempt < 3; attempt++) {
      const [row] = await sql`
        WITH g AS (
          SELECT COUNT(*)::int AS c,
                 COALESCE(MAX(NULLIF(regexp_replace(room, '[^0-9]', '', 'g'), '')::int), 0) + 1 AS n
          FROM residents WHERE is_guest = TRUE
        )
        INSERT INTO residents (
          id, name, room, wing, language, can_speak, assigned_nurse_id, age, code_status, fall_risk,
          mobility, cognition, allergies, care_notes, emergency_contact, status, heart_rate,
          last_motion_at, is_guest, device_id, created_at)
        SELECT 'g-' || g.n, COALESCE(${name}, 'Guest ' || g.n), 'G' || g.n, 'Guest', ${language}, TRUE,
               ${GUEST_NURSE_ID}, 80, 'Full code', 'Low', 'Independent', 'Oriented', '{}',
               'Guest resident who joined by QR code (demo).', ${GUEST_CONTACT}::jsonb, 'ok', ${heartRate},
               ${now}, TRUE, ${deviceId}, ${now}
        FROM g
        WHERE g.c < ${MAX_GUESTS}
          AND NOT EXISTS (SELECT 1 FROM residents WHERE device_id = ${deviceId})
        ON CONFLICT (id) DO NOTHING
        RETURNING id, name, room, language`;
      if (row) return Response.json(toBody(row as GuestRow, false), { status: 201 });

      // Nothing inserted: full, a double-tap from this device won the race, or a number clash (retry).
      const [state] = await sql`
        SELECT (SELECT COUNT(*)::int FROM residents WHERE is_guest = TRUE) AS c,
               (SELECT row_to_json(r) FROM (SELECT id, name, room, language FROM residents
                 WHERE is_guest = TRUE AND device_id = ${deviceId}) r) AS mine`;
      if (state?.mine) return Response.json(toBody(state.mine as GuestRow, true));
      if ((state?.c as number) >= MAX_GUESTS) {
        return Response.json({ error: "Demo is full", full: true }, { status: 409 });
      }
    }
    return Response.json({ error: "Busy, try again" }, { status: 503 });
  } catch (err) {
    console.error("/api/join failed:", err instanceof Error ? err.message : err);
    return Response.json({ error: "Failed to join" }, { status: 500 });
  }
}
