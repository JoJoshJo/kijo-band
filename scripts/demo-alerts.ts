/**
 * DEV ONLY — inserts 3 test alerts so the dashboard can be tested without the band.
 *   npm run demo:alerts            → add P1 fall (Mr. Davis), P2 French voice pain (Mme Dubois), P3 water (Mr. Ortiz)
 *   npm run demo:alerts -- --clear → first delete ALL alerts and reset resident/nurse statuses
 * Refuses to run when NODE_ENV=production. Requires seeded residents (npm run db:seed). Parameterized SQL only.
 */
import { randomBytes } from "node:crypto";
import { neon } from "@neondatabase/serverless";
import type { AlertPriority, AlertType } from "../src/lib/types";

if (process.env.NODE_ENV === "production") {
  console.error("demo:alerts is dev-only and refuses to run with NODE_ENV=production.");
  process.exit(1);
}
const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set. Put it in .env.local.");
  process.exit(1);
}
const sql = neon(url);

type DemoAlert = {
  residentId: string;
  type: AlertType;
  priority: AlertPriority;
  summary: string;
  transcript?: string;
  heartRate?: number;
  patientMessage: string;
  agoMs: number; // created this long ago, so timers/rings show different states
};

const demo: DemoAlert[] = [
  {
    residentId: "r-14", // Mr. Davis, South, Nurse Ben
    type: "fall",
    priority: 1,
    summary: "Probable fall, no movement 3s, HR 118",
    heartRate: 118,
    patientMessage: "Help is coming. Stay still if you can.",
    agoMs: 20_000,
  },
  {
    residentId: "r-02", // Mme Dubois, North, Nurse Ana (French)
    type: "voice",
    priority: 2,
    summary: "Back pain, asking for help (French voice call)",
    transcript: "J'ai mal au dos, aidez-moi s'il vous plaît",
    heartRate: 92,
    patientMessage: "Une infirmière arrive. Restez calme.",
    agoMs: 55_000,
  },
  {
    residentId: "r-03", // Mr. Ortiz, North, Nurse Ana (Spanish)
    type: "need_water",
    priority: 3,
    summary: "Requested water",
    patientMessage: "Una enfermera viene pronto con agua.",
    agoMs: 125_000,
  },
];

async function main() {
  if (process.argv.includes("--clear")) {
    await sql.transaction([
      sql`DELETE FROM alerts`,
      sql`UPDATE residents SET status = 'ok'`,
      sql`UPDATE nurses SET status = 'available'`,
    ]);
    console.log("✓ cleared all alerts");
  }

  const now = Date.now();
  for (const a of demo) {
    const [resident] = await sql`SELECT assigned_nurse_id, name FROM residents WHERE id = ${a.residentId}`;
    if (!resident) throw new Error(`Resident ${a.residentId} not found — run npm run db:seed first`);
    const status = a.priority === 1 ? "emergency" : "attention";
    await sql.transaction([
      sql`INSERT INTO alerts (resident_id, type, priority, summary, transcript, heart_rate, assigned_nurse_id,
                              status, created_at, patient_message, ack_token)
          VALUES (${a.residentId}, ${a.type}, ${a.priority}, ${a.summary}, ${a.transcript ?? null},
                  ${a.heartRate ?? null}, ${resident.assigned_nurse_id}, 'open', ${now - a.agoMs},
                  ${a.patientMessage}, ${randomBytes(24).toString("hex")})`,
      // Don't downgrade a resident who is already in a worse state.
      status === "emergency"
        ? sql`UPDATE residents SET status = 'emergency' WHERE id = ${a.residentId}`
        : sql`UPDATE residents SET status = 'attention' WHERE id = ${a.residentId} AND status = 'ok'`,
    ]);
    console.log(`✓ P${a.priority} ${a.type} → ${resident.name}`);
  }
}

main().catch((err) => {
  console.error("demo:alerts failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
