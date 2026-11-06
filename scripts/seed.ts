/**
 * Seed the Kijo demo database. Run with: npm run db:seed
 * Applies db/schema.sql, wipes all rows, then inserts 4 nurses + 24 fictional residents.
 * All residents are FICTIONAL demo data. Parameterized SQL only.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { neon } from "@neondatabase/serverless";
import type {
  Cognition,
  CodeStatus,
  FallRisk,
  Language,
  Mobility,
  Nurse,
  Wing,
} from "../src/lib/types";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set. Put it in .env.local, then run: npm run db:seed");
  process.exit(1);
}
const sql = neon(url);

const nurses: Nurse[] = [
  { id: "n-ana", name: "Nurse Ana", role: "CNA", wing: "North", status: "available" },
  { id: "n-ben", name: "Nurse Ben", role: "CNA", wing: "South", status: "available" },
  { id: "n-chloe", name: "Nurse Chloe", role: "RN", wing: "Floating", status: "available" },
  { id: "n-grace", name: "Nurse Grace", role: "Charge", wing: "All", status: "available" },
];

type Seed = {
  name: string;
  room: string;
  wing: Wing;
  nurse: string;
  lang: Language;
  canSpeak: boolean;
  age: number;
  code: CodeStatus;
  fall: FallRisk;
  mob: Mobility;
  cog: Cognition;
  allergies: string[];
  notes: string;
  contact: [name: string, relation: string, phone: string];
};

// North = rooms 1–12, South = rooms 13–24. Ana and Ben each cover 8 rooms in their wing;
// Chloe (floating RN) covers the last 4 of each wing. Grace (charge) takes escalations.
const residents: Seed[] = [
  // ── North ──
  { name: "Mrs. Thompson", room: "1", wing: "North", nurse: "n-ana", lang: "en", canSpeak: true, age: 84, code: "DNR", fall: "High", mob: "Walker", cog: "Mild confusion", allergies: ["Penicillin"], notes: "Hard of hearing (left ear). Gets up at night to use bathroom.", contact: ["Karen Thompson", "Daughter", "+1 404 555 0141"] },
  { name: "Mme Dubois", room: "2", wing: "North", nurse: "n-ana", lang: "fr", canSpeak: true, age: 79, code: "Full code", fall: "Medium", mob: "Walker", cog: "Oriented", allergies: [], notes: "French only. Diabetic — check sugar if confused.", contact: ["Luc Dubois", "Son", "+1 404 555 0172"] },
  { name: "Mr. Ortiz", room: "3", wing: "North", nurse: "n-ana", lang: "es", canSpeak: true, age: 81, code: "Full code", fall: "Low", mob: "Independent", cog: "Oriented", allergies: ["Shellfish"], notes: "Spanish preferred. Asks for water often at night.", contact: ["María Ortiz", "Wife", "+1 404 555 0119"] },
  { name: "Mr. Walker", room: "4", wing: "North", nurse: "n-ana", lang: "en", canSpeak: false, age: 88, code: "DNR", fall: "High", mob: "Bed-bound", cog: "Dementia", allergies: [], notes: "Non-verbal after stroke. Reposition every 2h.", contact: ["James Walker", "Son", "+1 404 555 0188"] },
  { name: "Mrs. Patel", room: "5", wing: "North", nurse: "n-ana", lang: "en", canSpeak: true, age: 76, code: "Full code", fall: "Medium", mob: "Wheelchair", cog: "Oriented", allergies: ["Latex"], notes: "Hip replacement 3 weeks ago. Pain meds at 02:00.", contact: ["Raj Patel", "Husband", "+1 404 555 0103"] },
  { name: "Mr. Brooks", room: "6", wing: "North", nurse: "n-ana", lang: "en", canSpeak: true, age: 90, code: "DNR", fall: "High", mob: "Walker", cog: "Dementia", allergies: [], notes: "Wanders at night. Bed alarm on.", contact: ["Linda Brooks", "Daughter", "+1 404 555 0155"] },
  { name: "Mrs. Nguyen", room: "7", wing: "North", nurse: "n-ana", lang: "en", canSpeak: true, age: 73, code: "Full code", fall: "Low", mob: "Independent", cog: "Oriented", allergies: ["Sulfa drugs"], notes: "COPD — watch breathing, O2 2L at night.", contact: ["Tom Nguyen", "Son", "+1 404 555 0127"] },
  { name: "Mrs. Lee", room: "8", wing: "North", nurse: "n-ana", lang: "en", canSpeak: true, age: 82, code: "Full code", fall: "Medium", mob: "Walker", cog: "Mild confusion", allergies: [], notes: "Chronic back pain. Reports pain readily.", contact: ["Grace Lee", "Niece", "+1 404 555 0164"] },
  { name: "M. Lambert", room: "9", wing: "North", nurse: "n-chloe", lang: "fr", canSpeak: true, age: 86, code: "DNR", fall: "High", mob: "Wheelchair", cog: "Mild confusion", allergies: ["Aspirin"], notes: "French only. On blood thinners — any fall is urgent.", contact: ["Claire Lambert", "Daughter", "+1 404 555 0133"] },
  { name: "Mr. Johnson", room: "10", wing: "North", nurse: "n-chloe", lang: "en", canSpeak: true, age: 78, code: "Full code", fall: "Low", mob: "Independent", cog: "Oriented", allergies: [], notes: "Heart failure — weigh daily, low-salt diet.", contact: ["Denise Johnson", "Wife", "+1 404 555 0146"] },
  { name: "Mrs. Hernández", room: "11", wing: "North", nurse: "n-chloe", lang: "es", canSpeak: false, age: 91, code: "DNR", fall: "High", mob: "Bed-bound", cog: "Dementia", allergies: ["Penicillin", "Codeine"], notes: "Non-verbal. Spanish-speaking family.", contact: ["Rosa Hernández", "Granddaughter", "+1 404 555 0198"] },
  { name: "Mr. Kim", room: "12", wing: "North", nurse: "n-chloe", lang: "en", canSpeak: true, age: 74, code: "Full code", fall: "Medium", mob: "Walker", cog: "Oriented", allergies: [], notes: "Parkinson's — tremor, slow to stand.", contact: ["Susan Kim", "Daughter", "+1 404 555 0111"] },
  // ── South ──
  { name: "Mrs. Garcia", room: "13", wing: "South", nurse: "n-ben", lang: "es", canSpeak: true, age: 80, code: "Full code", fall: "Medium", mob: "Walker", cog: "Oriented", allergies: [], notes: "Spanish preferred. Diabetic — check sugar if confused.", contact: ["Luis Garcia", "Son", "+1 404 555 0177"] },
  { name: "Mr. Davis", room: "14", wing: "South", nurse: "n-ben", lang: "en", canSpeak: true, age: 87, code: "Full code", fall: "High", mob: "Walker", cog: "Mild confusion", allergies: ["Penicillin"], notes: "Two falls this month. On blood thinners.", contact: ["Sarah Davis", "Daughter", "+1 404 555 0142"] },
  { name: "Mrs. Wilson", room: "15", wing: "South", nurse: "n-ben", lang: "en", canSpeak: true, age: 83, code: "DNR", fall: "Medium", mob: "Wheelchair", cog: "Oriented", allergies: [], notes: "Low vision — announce yourself when entering.", contact: ["Mark Wilson", "Son", "+1 404 555 0109"] },
  { name: "Mr. Martin", room: "16", wing: "South", nurse: "n-ben", lang: "en", canSpeak: false, age: 89, code: "DNR", fall: "High", mob: "Bed-bound", cog: "Dementia", allergies: [], notes: "Non-verbal. Responds to touch and calm voice.", contact: ["Anne Martin", "Wife", "+1 404 555 0185"] },
  { name: "Mme Moreau", room: "17", wing: "South", nurse: "n-ben", lang: "fr", canSpeak: true, age: 77, code: "Full code", fall: "Low", mob: "Independent", cog: "Oriented", allergies: ["Latex"], notes: "French only. Anxious at night — reassure.", contact: ["Paul Moreau", "Son", "+1 404 555 0126"] },
  { name: "Mr. Robinson", room: "18", wing: "South", nurse: "n-ben", lang: "en", canSpeak: true, age: 85, code: "Full code", fall: "Medium", mob: "Walker", cog: "Mild confusion", allergies: [], notes: "Sundowning after 22:00.", contact: ["Kim Robinson", "Daughter", "+1 404 555 0150"] },
  { name: "Mrs. Clark", room: "19", wing: "South", nurse: "n-ben", lang: "en", canSpeak: true, age: 72, code: "Full code", fall: "Low", mob: "Independent", cog: "Oriented", allergies: ["Peanuts"], notes: "Asthma — inhaler at bedside.", contact: ["David Clark", "Husband", "+1 404 555 0137"] },
  { name: "Mr. Lewis", room: "20", wing: "South", nurse: "n-ben", lang: "en", canSpeak: true, age: 92, code: "DNR", fall: "High", mob: "Wheelchair", cog: "Dementia", allergies: [], notes: "Wanders at night. Pull-tab alarm on chair.", contact: ["Helen Lewis", "Daughter", "+1 404 555 0193"] },
  { name: "Sr. Ramírez", room: "21", wing: "South", nurse: "n-chloe", lang: "es", canSpeak: true, age: 79, code: "Full code", fall: "Medium", mob: "Walker", cog: "Oriented", allergies: ["Sulfa drugs"], notes: "Spanish only. Kidney disease — fluid restriction.", contact: ["Elena Ramírez", "Daughter", "+1 404 555 0114"] },
  { name: "Mrs. Young", room: "22", wing: "South", nurse: "n-chloe", lang: "en", canSpeak: true, age: 75, code: "Full code", fall: "Low", mob: "Independent", cog: "Oriented", allergies: [], notes: "Post-surgery (knee). Ice pack at night.", contact: ["Brian Young", "Son", "+1 404 555 0168"] },
  { name: "Mr. Allen", room: "23", wing: "South", nurse: "n-chloe", lang: "en", canSpeak: false, age: 86, code: "DNR", fall: "High", mob: "Bed-bound", cog: "Dementia", allergies: ["Iodine"], notes: "Non-verbal. Feeding tube — keep head of bed up.", contact: ["Carol Allen", "Wife", "+1 404 555 0121"] },
  { name: "Mme Girard", room: "24", wing: "South", nurse: "n-chloe", lang: "fr", canSpeak: true, age: 81, code: "Full code", fall: "Medium", mob: "Walker", cog: "Mild confusion", allergies: [], notes: "French only. Hearing aid — remove at night.", contact: ["Sophie Girard", "Daughter", "+1 404 555 0159"] },
];

function splitStatements(text: string): string[] {
  return text
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n")
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);
}

async function main() {
  const schema = readFileSync(join(process.cwd(), "db", "schema.sql"), "utf8");
  for (const stmt of splitStatements(schema)) {
    await sql.query(stmt);
  }
  console.log("✓ schema applied");

  // Order matters for foreign keys.
  await sql`DELETE FROM alerts`;
  await sql`DELETE FROM residents`;
  await sql`DELETE FROM nurses`;

  for (const n of nurses) {
    await sql`INSERT INTO nurses (id, name, role, wing, status)
              VALUES (${n.id}, ${n.name}, ${n.role}, ${n.wing}, ${n.status})`;
  }
  console.log(`✓ ${nurses.length} nurses`);

  const now = Date.now();
  for (const r of residents) {
    const id = `r-${r.room.padStart(2, "0")}`;
    const heartRate = 62 + Math.floor(Math.random() * 19); // resting 62–80
    const lastMotionAt = now - Math.floor(Math.random() * 10 * 60_000);
    const contact = JSON.stringify({ name: r.contact[0], relation: r.contact[1], phone: r.contact[2] });
    await sql`INSERT INTO residents (
                id, name, room, wing, language, can_speak, assigned_nurse_id, age, code_status,
                fall_risk, mobility, cognition, allergies, care_notes, emergency_contact, status,
                heart_rate, last_motion_at, is_guest, created_at)
              VALUES (
                ${id}, ${r.name}, ${r.room}, ${r.wing}, ${r.lang}, ${r.canSpeak}, ${r.nurse}, ${r.age},
                ${r.code}, ${r.fall}, ${r.mob}, ${r.cog}, ${r.allergies}, ${r.notes}, ${contact}::jsonb,
                'ok', ${heartRate}, ${lastMotionAt}, FALSE, ${now})`;
  }
  const north = residents.filter((r) => r.wing === "North").length;
  console.log(`✓ ${residents.length} residents (North ${north}, South ${residents.length - north}, Guest 0)`);
}

main().catch((err) => {
  console.error("Seed failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
