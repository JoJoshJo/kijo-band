import "server-only";
import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import type { Alert, Nurse, Resident, StateResponse } from "./types";

// Lazy so `next build` works without DATABASE_URL; fails loudly at request time instead.
let client: NeonQueryFunction<false, false> | null = null;

export function getSql(): NeonQueryFunction<false, false> {
  if (!client) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set (add it to .env.local)");
    client = neon(url);
  }
  return client;
}

type Row = Record<string, unknown>;

// BIGINT columns come back as strings from Postgres; convert to numbers.
const num = (v: unknown): number => Number(v);
const optNum = (v: unknown): number | undefined => (v == null ? undefined : Number(v));
const optStr = (v: unknown): string | undefined => (v == null ? undefined : String(v));

export function rowToResident(r: Row): Resident {
  return {
    id: r.id as string,
    name: r.name as string,
    room: r.room as string,
    wing: r.wing as Resident["wing"],
    language: r.language as Resident["language"],
    canSpeak: r.can_speak as boolean,
    assignedNurseId: r.assigned_nurse_id as string,
    age: num(r.age),
    codeStatus: r.code_status as Resident["codeStatus"],
    fallRisk: r.fall_risk as Resident["fallRisk"],
    mobility: r.mobility as Resident["mobility"],
    cognition: r.cognition as Resident["cognition"],
    allergies: (r.allergies as string[]) ?? [],
    careNotes: r.care_notes as string,
    emergencyContact: r.emergency_contact as Resident["emergencyContact"],
    status: r.status as Resident["status"],
    heartRate: num(r.heart_rate),
    lastMotionAt: num(r.last_motion_at),
    ...(r.is_guest ? { isGuest: true } : {}),
    createdAt: num(r.created_at),
  };
}

export function rowToNurse(r: Row): Nurse {
  return {
    id: r.id as string,
    name: r.name as string,
    role: r.role as Nurse["role"],
    wing: r.wing as string,
    status: r.status as Nurse["status"],
  };
}

export function rowToAlert(r: Row): Alert {
  return {
    id: r.id as string,
    residentId: r.resident_id as string,
    type: r.type as Alert["type"],
    priority: num(r.priority) as Alert["priority"],
    summary: r.summary as string,
    transcript: optStr(r.transcript),
    heartRate: optNum(r.heart_rate),
    assignedNurseId: r.assigned_nurse_id as string,
    escalatedTo: optStr(r.escalated_to),
    assistingNurseIds: (r.assisting_nurse_ids as string[]) ?? [],
    status: r.status as Alert["status"],
    createdAt: num(r.created_at),
    acknowledgedAt: optNum(r.acknowledged_at),
    resolvedAt: optNum(r.resolved_at),
    patientMessage: r.patient_message as string,
  };
}

/** Residents, nurses, and active (not resolved) alerts. Never selects ack_token or device_id. */
export async function getState(): Promise<StateResponse> {
  const sql = getSql();
  const [residents, nurses, alerts] = await Promise.all([
    sql`SELECT id, name, room, wing, language, can_speak, assigned_nurse_id, age, code_status,
               fall_risk, mobility, cognition, allergies, care_notes, emergency_contact, status,
               heart_rate, last_motion_at, is_guest, created_at
        FROM residents
        ORDER BY wing, (NULLIF(regexp_replace(room, '[^0-9]', '', 'g'), ''))::int NULLS LAST, room`,
    sql`SELECT id, name, role, wing, status FROM nurses ORDER BY id`,
    sql`SELECT id, resident_id, type, priority, summary, transcript, heart_rate, assigned_nurse_id,
               escalated_to, assisting_nurse_ids, status, created_at, acknowledged_at, resolved_at,
               patient_message
        FROM alerts
        WHERE status <> 'resolved'
        ORDER BY priority ASC, created_at ASC`,
  ]);
  return {
    residents: residents.map(rowToResident),
    nurses: nurses.map(rowToNurse),
    alerts: alerts.map(rowToAlert),
    serverTime: Date.now(),
  };
}
