// Input validation for the Charge view's resident management (/api/admin/residents/**).
// Pure (no I/O) so it is unit-tested in adminPatients.test.ts and shared with the client form.

import type { Language } from "./types";

export const LANGS: readonly Language[] = ["en", "fr", "es"];
export const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
export const PATIENT_NAME_MAX = 40;
export const ROOM_MAX = 6;
const NAME_RE = /^[\p{L}\p{M}' ’.-]+$/u; // letters (any alphabet) + space, apostrophe, period, hyphen
const LETTER = /\p{L}/u;
const ROOM_RE = /^[A-Za-z0-9-]+$/;
const GUEST_ROOM_RE = /^g\d+$/i; // G1, G2… belong to QR guests

export type NewPatient = { name: string; room: string; language: Language; canSpeak: boolean; nurseId: string };
export type Invalid = { ok: false; field: keyof NewPatient | "body"; error: string };

const clean = (v: string) => v.replace(/\s+/g, " ").trim();

export function validatePatientName(v: unknown): { ok: true; name: string } | { ok: false; error: string } {
  if (typeof v !== "string" || !clean(v)) return { ok: false, error: "Enter a name." };
  const name = clean(v);
  if ([...name].length < 2) return { ok: false, error: "Use at least 2 characters for the name." };
  if (name.length > PATIENT_NAME_MAX) return { ok: false, error: `Use at most ${PATIENT_NAME_MAX} characters for the name.` };
  if (!NAME_RE.test(name) || !LETTER.test(name)) {
    return { ok: false, error: "Use letters, spaces, periods, hyphens or apostrophes in the name." };
  }
  return { ok: true, name };
}

export function validateRoom(v: unknown): { ok: true; room: string } | { ok: false; error: string } {
  if (typeof v !== "string" || !v.trim()) return { ok: false, error: "Enter a room number." };
  const room = v.trim().replace(/^room\s*/i, "");
  if (!room || room.length > ROOM_MAX || !ROOM_RE.test(room)) {
    return { ok: false, error: `Use up to ${ROOM_MAX} letters, digits or hyphens for the room.` };
  }
  if (GUEST_ROOM_RE.test(room)) return { ok: false, error: "Rooms G1, G2 and so on are for residents who join by QR code. Pick another room." };
  return { ok: true, room };
}

export function validateNewPatient(body: unknown): { ok: true; value: NewPatient } | Invalid {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { ok: false, field: "body", error: "Body must be a JSON object" };
  }
  const b = body as Record<string, unknown>;
  const name = validatePatientName(b.name);
  if (!name.ok) return { ok: false, field: "name", error: name.error };
  const room = validateRoom(b.room);
  if (!room.ok) return { ok: false, field: "room", error: room.error };
  if (typeof b.language !== "string" || !LANGS.includes(b.language as Language)) {
    return { ok: false, field: "language", error: "Choose English, French or Spanish." };
  }
  if (typeof b.canSpeak !== "boolean") return { ok: false, field: "canSpeak", error: "canSpeak must be true or false" };
  if (typeof b.nurseId !== "string" || !ID_RE.test(b.nurseId)) {
    return { ok: false, field: "nurseId", error: "Choose a nurse from the list." };
  }
  return {
    ok: true,
    value: { name: name.name, room: room.room, language: b.language as Language, canSpeak: b.canSpeak, nurseId: b.nurseId },
  };
}

export type PatientAction = { action: "move"; nurseId: string } | { action: "remove" };

export function validatePatientAction(body: unknown): { ok: true; value: PatientAction } | { ok: false; error: string } {
  if (typeof body !== "object" || body === null || Array.isArray(body)) return { ok: false, error: "Body must be a JSON object" };
  const b = body as Record<string, unknown>;
  if (b.action === "remove") return { ok: true, value: { action: "remove" } };
  if (b.action === "move") {
    if (typeof b.nurseId !== "string" || !ID_RE.test(b.nurseId)) return { ok: false, error: "Invalid nurseId" };
    return { ok: true, value: { action: "move", nurseId: b.nurseId } };
  }
  return { ok: false, error: "action must be move or remove" };
}
