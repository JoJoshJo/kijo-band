import "server-only";
import { randomBytes } from "node:crypto";
import { after } from "next/server";
import { getSql, rowToAlert } from "@/lib/db";
import { sendNtfy } from "@/lib/notify";
import { ALERT_RATE_LIMIT_MS } from "@/lib/detection/alertRules";
import type { Alert, AlertPriority, AlertType, Language } from "@/lib/types";
import { STRINGS } from "@/app/band/_lib/i18n";

export interface NewAlert {
  residentId: string;
  type: AlertType;
  priority: AlertPriority;
  summary: string;
  heartRate?: number;
  transcript?: string;
  /** Defaults to "Help is coming" in the resident's language. */
  patientMessage?: string | ((lang: Language) => string);
}

export type CreateAlertResult =
  | { kind: "created"; alert: Alert }
  | { kind: "not_found" }
  | { kind: "rate_limited"; retryAfterMs: number };

/**
 * The single path every alert takes (/api/alert and /api/triage): rate-limit guard + insert +
 * resident status update in one parameterized statement, then the ntfy push (after the response).
 * Status rule (shared with Session A): any open/acknowledged P1 → emergency, else attention.
 */
export async function createAlert(input: NewAlert): Promise<CreateAlertResult> {
  const sql = getSql();
  const { residentId, type, priority, summary } = input;
  const heartRate = input.heartRate ?? null;
  const transcript = input.transcript ?? null;

  const [resident] = await sql`SELECT id, name, room, language FROM residents WHERE id = ${residentId}`;
  if (!resident) return { kind: "not_found" };
  const lang = resident.language as Language;
  const patientMessage =
    typeof input.patientMessage === "function"
      ? input.patientMessage(lang)
      : input.patientMessage ?? STRINGS[lang].helpComing;

  const now = Date.now();
  const ackToken = randomBytes(24).toString("base64url");

  // The `upd` subquery can't see the row inserted by `ins`, so the new alert's priority is checked directly.
  const rows = await sql`
    WITH ins AS (
      INSERT INTO alerts (resident_id, type, priority, summary, transcript, heart_rate, assigned_nurse_id,
                          status, created_at, patient_message, ack_token)
      SELECT r.id, ${type}, ${priority}, ${summary}, ${transcript}, ${heartRate}, r.assigned_nurse_id,
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
          heart_rate = COALESCE(${heartRate}::int, heart_rate)
      WHERE id = ${residentId} AND EXISTS (SELECT 1 FROM ins)
    )
    SELECT * FROM ins`;

  if (rows.length === 0) {
    const [last] = await sql`SELECT MAX(created_at) AS t FROM alerts WHERE resident_id = ${residentId}`;
    const retryAfterMs = Math.max(0, Number(last?.t ?? now) + ALERT_RATE_LIMIT_MS - now);
    return { kind: "rate_limited", retryAfterMs };
  }

  const alert = rowToAlert(rows[0]);
  // Push to nurse phones after the response is sent, so the band and dashboard aren't slowed by ntfy.
  const pushResident = { name: resident.name as string, room: resident.room as string };
  after(() => sendNtfy({ alert, resident: pushResident, ackToken }));
  return { kind: "created", alert };
}

export function rateLimitedResponse(retryAfterMs: number): Response {
  return Response.json(
    { error: "Rate limited: max 1 alert per 10s per resident", retryAfterMs },
    { status: 429, headers: { "Retry-After": String(Math.ceil(retryAfterMs / 1000)) } },
  );
}
