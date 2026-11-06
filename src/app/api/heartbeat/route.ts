import { getSql } from "@/lib/db";
import { INVALID_JSON, isHeartRate, isObject, isResidentId, readJson } from "../alert/validate";

const MIN_INTERVAL_MS = 900; // ~1 write/s per resident (band posts every 2s)
const lastWrite = new Map<string, number>();

/**
 * Per-instance limiter. On serverless each instance has its own map, so this is a cheap guard
 * against a runaway client, not a hard global limit.
 */
function allow(residentId: string, now: number): boolean {
  const prev = lastWrite.get(residentId) ?? 0;
  if (now - prev < MIN_INTERVAL_MS) return false;
  lastWrite.set(residentId, now);
  if (lastWrite.size > 500) {
    for (const [id, t] of lastWrite) if (now - t > 60_000) lastWrite.delete(id);
  }
  return true;
}

// POST /api/heartbeat { residentId, heartRate, moved? } → 204
// Updates ONLY residents.heart_rate, and residents.last_motion_at when the band saw movement.
export async function POST(request: Request) {
  const b = await readJson(request);
  if (b === INVALID_JSON) return Response.json({ error: "Invalid JSON" }, { status: 400 });
  if (!isObject(b)) return Response.json({ error: "Body must be a JSON object" }, { status: 400 });
  if (!isResidentId(b.residentId)) return Response.json({ error: "Invalid residentId" }, { status: 400 });
  if (!isHeartRate(b.heartRate)) return Response.json({ error: "Invalid heartRate (integer 20–250)" }, { status: 400 });
  if (b.moved !== undefined && typeof b.moved !== "boolean") {
    return Response.json({ error: "Invalid moved (boolean)" }, { status: 400 });
  }

  const now = Date.now();
  if (!allow(b.residentId, now)) {
    return Response.json({ error: "Too many heartbeats" }, { status: 429, headers: { "Retry-After": "1" } });
  }

  try {
    const sql = getSql();
    const moved = b.moved === true;
    const rows = await sql`
      UPDATE residents
      SET heart_rate = ${b.heartRate},
          last_motion_at = CASE WHEN ${moved}::boolean THEN ${now}::bigint ELSE last_motion_at END
      WHERE id = ${b.residentId}
      RETURNING id`;
    if (rows.length === 0) return Response.json({ error: "Resident not found" }, { status: 404 });
    return new Response(null, { status: 204 });
  } catch (err) {
    console.error("/api/heartbeat failed:", err);
    return Response.json({ error: "Failed to save heartbeat" }, { status: 500 });
  }
}
