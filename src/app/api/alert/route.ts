import { randomBytes } from "node:crypto";
import { getSql, rowToAlert } from "@/lib/db";
import type { Language } from "@/lib/types";
import {
  ALERT_RATE_LIMIT_MS,
  ALERT_SOURCES,
  BAND_ALERT_TYPES,
  priorityFor,
  summaryFor,
  type AlertSource,
  type BandAlertType,
} from "@/lib/detection/alertRules";
import { STRINGS } from "@/app/band/_lib/i18n";
import { sendNtfy } from "./notify";

const RESIDENT_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

type ParsedBody = { residentId: string; type: BandAlertType; source?: AlertSource; heartRate?: number };

function parseBody(body: unknown): ParsedBody | string {
  if (typeof body !== "object" || body === null || Array.isArray(body)) return "Body must be a JSON object";
  const b = body as Record<string, unknown>;

  if (typeof b.residentId !== "string" || !RESIDENT_ID_RE.test(b.residentId)) return "Invalid residentId";
  if (typeof b.type !== "string" || !(BAND_ALERT_TYPES as readonly string[]).includes(b.type)) {
    return "Invalid type";
  }
  if (b.source !== undefined && (typeof b.source !== "string" || !(ALERT_SOURCES as readonly string[]).includes(b.source))) {
    return "Invalid source";
  }
  if (
    b.heartRate !== undefined &&
    (typeof b.heartRate !== "number" || !Number.isInteger(b.heartRate) || b.heartRate < 20 || b.heartRate > 250)
  ) {
    return "Invalid heartRate (integer 20–250)";
  }
  return {
    residentId: b.residentId,
    type: b.type as BandAlertType,
    source: b.source as AlertSource | undefined,
    heartRate: b.heartRate as number | undefined,
  };
}

// POST /api/alert  { residentId, type, source?, heartRate? } → 201 { alert }
export async function POST(request: Request) {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = parseBody(raw);
  if (typeof parsed === "string") return Response.json({ error: parsed }, { status: 400 });
  const { residentId, type, source, heartRate } = parsed;

  try {
    const sql = getSql();
    const [resident] = await sql`SELECT id, name, room, language FROM residents WHERE id = ${residentId}`;
    if (!resident) return Response.json({ error: "Resident not found" }, { status: 404 });

    const now = Date.now();
    const priority = priorityFor(type, source);
    const summary = summaryFor(type, source, heartRate);
    const patientMessage = STRINGS[resident.language as Language].helpComing;
    const ackToken = randomBytes(24).toString("base64url");

    // One statement: rate-limit guard + insert + resident status update, so two fast taps
    // can't both slip past a separate "check, then insert".
    // Status rule (shared with Session A): any open/acknowledged P1 → emergency, else attention.
    // (The subquery can't see the row inserted by `ins`, so the new alert's priority is checked directly.)
    const rows = await sql`
      WITH ins AS (
        INSERT INTO alerts (resident_id, type, priority, summary, heart_rate, assigned_nurse_id,
                            status, created_at, patient_message, ack_token)
        SELECT r.id, ${type}, ${priority}, ${summary}, ${heartRate ?? null}, r.assigned_nurse_id,
               'open', ${now}, ${patientMessage}, ${ackToken}
        FROM residents r
        WHERE r.id = ${residentId}
          AND NOT EXISTS (
            SELECT 1 FROM alerts a
            WHERE a.resident_id = ${residentId} AND a.created_at > ${now - ALERT_RATE_LIMIT_MS}
          )
        RETURNING id, resident_id, type, priority, summary, transcript, heart_rate, assigned_nurse_id,
                  escalated_to, assisting_nurse_ids, status, created_at, acknowledged_at, resolved_at,
                  patient_message
      ), upd AS (
        UPDATE residents
        SET status = CASE
              WHEN ${priority}::int = 1 OR EXISTS (
                SELECT 1 FROM alerts a
                WHERE a.resident_id = ${residentId} AND a.priority = 1
                  AND a.status IN ('open', 'acknowledged')
              ) THEN 'emergency'
              ELSE 'attention'
            END,
            heart_rate = COALESCE(${heartRate ?? null}::int, heart_rate)
        WHERE id = ${residentId} AND EXISTS (SELECT 1 FROM ins)
      )
      SELECT * FROM ins`;

    if (rows.length === 0) {
      const [last] = await sql`
        SELECT MAX(created_at) AS t FROM alerts WHERE resident_id = ${residentId}`;
      const retryAfterMs = Math.max(0, Number(last?.t ?? now) + ALERT_RATE_LIMIT_MS - now);
      return Response.json(
        { error: "Rate limited: max 1 alert per 10s per resident", retryAfterMs },
        { status: 429, headers: { "Retry-After": String(Math.ceil(retryAfterMs / 1000)) } },
      );
    }

    const alert = rowToAlert(rows[0]);
    await sendNtfy(alert, { name: resident.name as string, room: resident.room as string }, ackToken);
    return Response.json({ alert }, { status: 201 });
  } catch (err) {
    console.error("/api/alert failed:", err);
    return Response.json({ error: "Failed to create alert" }, { status: 500 });
  }
}
