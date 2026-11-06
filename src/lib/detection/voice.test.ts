// Run: npx tsx --test src/lib/detection/*.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { containsTrigger, keywordTriage, normalize } from "./voice";

test("normalize strips accents, apostrophes and punctuation", () => {
  assert.equal(normalize("Help, I can’t breathe!"), "help i cant breathe");
  assert.equal(normalize("Je suis tombée…"), "je suis tombee");
  assert.equal(normalize("¡Me caí!"), "me cai");
});

test("trigger words per language", () => {
  assert.ok(containsTrigger("Help, I can't breathe", "en"));
  assert.ok(containsTrigger("Can I get some water", "en"));
  assert.ok(containsTrigger("Au secours", "fr"));
  assert.ok(containsTrigger("J'ai mal au dos", "fr"));
  assert.ok(containsTrigger("Me duele la cabeza", "es"));
  assert.ok(containsTrigger("help", "es"), "English help works for everyone");
  assert.ok(!containsTrigger("What time is it", "en"));
  assert.ok(!containsTrigger("The weather is nice today", "en"), "no substring matches (weather ≠ water)");
  assert.ok(!containsTrigger("Bonjour, ça va bien", "fr"));
  assert.ok(!containsTrigger("", "en"));
});

test('acceptance: "Help, I can\'t breathe" → P1', () => {
  const r = keywordTriage("Help, I can't breathe", "en");
  assert.equal(r.priority, 1);
  assert.equal(r.category, "breathing");
});

test('acceptance: "Can I get some water" → P3', () => {
  const r = keywordTriage("Can I get some water", "en");
  assert.equal(r.priority, 3);
  assert.equal(r.category, "water");
});

test("falls are P1 in every language", () => {
  assert.equal(keywordTriage("I fell in the bathroom", "en").priority, 1);
  assert.equal(keywordTriage("Je suis tombée", "fr").priority, 1);
  assert.equal(keywordTriage("Ayuda, me caí", "es").priority, 1);
});

test("pain beats comfort, comfort beats generic help", () => {
  assert.equal(keywordTriage("My hip hurts, can I have water", "en").priority, 2);
  assert.equal(keywordTriage("Help, I need the bathroom", "en").priority, 3);
  assert.equal(keywordTriage("Nurse, please come", "en").priority, 2);
  assert.equal(keywordTriage("J'ai mal au dos", "fr").category, "pain");
});

test("patient message is in the resident's language; summary stays English and short", () => {
  const r = keywordTriage("J'ai mal", "fr");
  assert.match(r.patientMessage, /Quelqu'un/);
  assert.ok(r.summary.split(/\s+/).length <= 15);
  assert.match(r.summary, /^Reports pain/);
});

test("unclear call defaults to P2", () => {
  assert.equal(keywordTriage("something something", "en").priority, 2);
});
