import { test } from "node:test";
import assert from "node:assert/strict";
import { validateName } from "./guestName";

test("accepts real names in many forms", () => {
  for (const n of ["Jo", "Josh", "Mary-Jane", "O'Brien", "Zoë", "José María", "Ngozi", "D’Arcy", "李雷"]) {
    assert.deepEqual(validateName(n), { ok: true, name: n }, n);
  }
});

test("trims and collapses spaces", () => {
  assert.deepEqual(validateName("  Ana   Lucia  "), { ok: true, name: "Ana Lucia" });
});

test("rejects missing, short, long and odd input", () => {
  assert.deepEqual(validateName(""), { ok: false, error: "required" });
  assert.deepEqual(validateName("   "), { ok: false, error: "required" });
  assert.deepEqual(validateName(undefined), { ok: false, error: "required" });
  assert.deepEqual(validateName("J"), { ok: false, error: "too_short" });
  assert.deepEqual(validateName("A".repeat(21)), { ok: false, error: "too_long" });
  for (const n of ["Josh2", "<b>hi</b>", "a@b", "--", "' '", "😀😀"]) {
    assert.equal(validateName(n).ok, false, n);
  }
});
