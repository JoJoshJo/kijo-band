import { test } from "node:test";
import assert from "node:assert/strict";
import { validateNewPatient, validatePatientAction, validatePatientName, validateRoom } from "./adminPatients";

const good = { name: "  Mrs.  O’Neil-Brown ", room: "Room 25", language: "fr", canSpeak: false, nurseId: "n-ana" };

test("validateNewPatient cleans a valid patient", () => {
  const r = validateNewPatient(good);
  assert.deepEqual(r, { ok: true, value: { name: "Mrs. O’Neil-Brown", room: "25", language: "fr", canSpeak: false, nurseId: "n-ana" } });
});

test("validateNewPatient rejects bad fields", () => {
  for (const [patch, field] of [
    [{ name: "" }, "name"],
    [{ name: "A" }, "name"],
    [{ name: "x".repeat(41) }, "name"],
    [{ name: "<script>" }, "name"],
    [{ name: "1234" }, "name"],
    [{ room: "" }, "room"],
    [{ room: "12 B" }, "room"],
    [{ room: "1234567" }, "room"],
    [{ room: "G3" }, "room"],
    [{ room: 5 }, "room"],
    [{ language: "de" }, "language"],
    [{ canSpeak: "yes" }, "canSpeak"],
    [{ nurseId: "n ana" }, "nurseId"],
    [{ nurseId: undefined }, "nurseId"],
  ] as const) {
    const r = validateNewPatient({ ...good, ...patch });
    assert.equal(r.ok, false, JSON.stringify(patch));
    if (!r.ok) assert.equal(r.field, field, JSON.stringify(patch));
  }
  assert.equal(validateNewPatient(null).ok, false);
  assert.equal(validateNewPatient([good]).ok, false);
});

test("name and room helpers", () => {
  assert.deepEqual(validatePatientName("José Ñúñez"), { ok: true, name: "José Ñúñez" });
  assert.deepEqual(validateRoom("14a"), { ok: true, room: "14a" });
  assert.equal(validateRoom("g12").ok, false);
});

test("validatePatientAction", () => {
  assert.deepEqual(validatePatientAction({ action: "remove" }), { ok: true, value: { action: "remove" } });
  assert.deepEqual(validatePatientAction({ action: "move", nurseId: "n-ben" }), {
    ok: true,
    value: { action: "move", nurseId: "n-ben" },
  });
  assert.equal(validatePatientAction({ action: "move" }).ok, false);
  assert.equal(validatePatientAction({ action: "move", nurseId: "'; DROP" }).ok, false);
  assert.equal(validatePatientAction({ action: "delete" }).ok, false);
  assert.equal(validatePatientAction("remove").ok, false);
});
