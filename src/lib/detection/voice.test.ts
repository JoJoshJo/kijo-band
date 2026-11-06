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

// ── FR / ES: normalization + trigger matching on real recognizer output ──

test("normalize: French elisions split, every apostrophe style, accents stripped", () => {
  assert.equal(normalize("J’ai mal"), "j ai mal");
  assert.equal(normalize("J'ai mal"), "j ai mal");
  assert.equal(normalize("Jʼai mal"), "j ai mal");
  assert.equal(normalize("À l’aide !"), "a l aide");
  assert.equal(normalize("Je voudrais de l'eau"), "je voudrais de l eau");
  assert.equal(normalize("J’ai besoin d’aide"), "j ai besoin d aide");
  assert.equal(normalize("Appelez l’infirmière"), "appelez l infirmiere");
  assert.equal(normalize("Aidez-moi"), "aidez moi");
  assert.equal(normalize("Ayúdeme, por favor"), "ayudeme por favor");
  assert.equal(normalize("¿Dónde está el baño?"), "donde esta el bano");
  assert.equal(normalize("I can't breathe"), "i cant breathe", "English contractions unchanged");
  assert.equal(normalize("Je suis tombée"), "je suis tombee", "decomposed accents too");
});

const FR_TRIGGERS = [
  "À l’aide", "à l'aide", "Aidez-moi", "aidez moi s'il vous plaît", "Au secours", "Je suis tombé", "Je suis tombée",
  "je suis tombée par terre", "J’ai mal", "J'ai mal au ventre", "Urgence", "C'est urgent", "Infirmière",
  "Appelez l’infirmière", "Je voudrais de l’eau", "De l'eau s'il vous plaît", "J'ai soif", "Les toilettes",
  "Je dois aller aux toilettes", "J’ai besoin d’aide",
];
const ES_TRIGGERS = [
  "Ayuda", "¡Ayúdeme!", "Ayúdenme por favor", "Socorro", "Me caí", "Me he caído", "Me duele la cadera",
  "Tengo mucho dolor", "Emergencia", "Enfermera", "Quiero agua", "Tengo sed", "Necesito ir al baño",
];

test("FR trigger phrases match recognizer output (fr resident)", () => {
  for (const s of FR_TRIGGERS) assert.ok(containsTrigger(s, "fr"), s);
});

test("ES trigger phrases match recognizer output (es resident)", () => {
  for (const s of ES_TRIGGERS) assert.ok(containsTrigger(s, "es"), s);
});

test("FR / ES everyday chatter does not trigger", () => {
  for (const s of ["Bonjour, ça va bien", "Il fait beau aujourd'hui", "Merci beaucoup", "Bonne nuit", "Quelle heure est-il"]) {
    assert.ok(!containsTrigger(s, "fr"), s);
  }
  for (const s of ["Buenos días", "Gracias", "¿Qué hora es?", "Hace buen tiempo"]) assert.ok(!containsTrigger(s, "es"), s);
});

test("FR / ES keyword triage (Claude unavailable) classifies elided and imperative forms", () => {
  assert.equal(keywordTriage("Je voudrais de l’eau", "fr").category, "water");
  assert.equal(keywordTriage("J’ai mal au dos", "fr").category, "pain");
  assert.equal(keywordTriage("À l’aide", "fr").category, "help");
  assert.equal(keywordTriage("Aidez-moi", "fr").category, "help");
  assert.equal(keywordTriage("Appelez l’infirmière", "fr").priority, 1, "appelez = call for emergency help");
  assert.equal(keywordTriage("Au secours", "fr").priority, 1);
  assert.equal(keywordTriage("Je suis tombée", "fr").category, "fall");
  assert.equal(keywordTriage("Les toilettes s’il vous plaît", "fr").category, "bathroom");
  assert.equal(keywordTriage("¡Ayúdeme!", "es").category, "help");
  assert.equal(keywordTriage("¡Socorro!", "es").priority, 1);
  assert.equal(keywordTriage("Me he caído", "es").category, "fall");
  assert.equal(keywordTriage("Necesito ir al baño", "es").category, "bathroom");
});
