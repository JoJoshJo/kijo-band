// Run: npx tsx --test src/lib/detection/*.test.ts
// The decision table for background listening (decideUtterance = the single source of truth).
import { test } from "node:test";
import assert from "node:assert/strict";
import type { Language } from "@/lib/types";
import { decideUtterance, sameUtterance } from "./voice";

type Want = "base" | "emergency" | "wake" | "ask" | "too-long" | "no-trigger" | "empty";
const CASES: [Language, string, Want, string?][] = [
  // Base words alone / short requests — no wake word needed
  ["en", "Help", "base"],
  ["en", "Water please", "base"],
  ["en", "I need the toilet", "base"],
  ["en", "It hurts", "base"],
  ["en", "Can I have some water please", "base"], // 6 words
  ["fr", "Aidez-moi !", "base"],
  ["fr", "De l'eau s'il vous plaît", "base"],
  ["fr", "Les toilettes", "base"],
  ["fr", "J'ai mal", "base"],
  ["es", "Ayuda", "base"],
  ["es", "Agua por favor", "base"],
  ["es", "Necesito el baño", "base"],
  ["es", "Me duele", "base"],
  // Long chatter with a base word, no Kijo → ignored (too long)
  ["en", "my grandson brought me some water yesterday afternoon", "too-long"],
  ["fr", "ma fille m'a apporté de l'eau hier après-midi", "too-long"],
  ["es", "mi hija me trajo agua ayer por la tarde", "too-long"],
  // Chatter without any trigger
  ["en", "what a lovely day", "no-trigger"],
  ["fr", "quelle belle journée", "no-trigger"],
  ["es", "qué día tan bonito", "no-trigger"],
  ["en", "  ...  ", "empty"],
  // Emergency phrases: always, any length
  ["en", "I was walking to the kitchen and I fell down near the table", "emergency"],
  ["fr", "je suis tombée dans la salle de bain en allant me coucher", "emergency"],
  ["es", "me caí en el pasillo cuando iba a la cocina", "emergency"],
  ["en", "I can't breathe", "emergency"],
  ["fr", "je n'arrive pas à respirer", "emergency"],
  ["es", "no puedo respirar", "emergency"],
  // "Kijo …" → everything after it, any length
  ["en", "Kijo, could you ask someone to bring my glasses from the other room", "wake", "could you ask someone to bring my glasses from the other room"],
  ["fr", "Kijo, je voudrais que quelqu'un vienne fermer la fenêtre", "wake", "je voudrais que quelqu'un vienne fermer la fenêtre"],
  ["es", "Kijo, quiero que alguien venga a cerrar la ventana", "wake", "quiero que alguien venga a cerrar la ventana"],
  ["en", "Key jo water", "wake", "water"],
  // "Kijo" alone → ask "Yes?"
  ["en", "Kijo", "ask"],
  ["fr", "Kijo ?", "ask"],
  ["es", "Kijo.", "ask"],
  // Not the wake word
  ["en", "the key, Jo, is on the table", "no-trigger"],
];

for (const [lang, text, want, cmd] of CASES) {
  test(`${lang}: "${text}" → ${want}`, () => {
    const d = decideUtterance(text, lang);
    const got = d.action === "send" ? d.kind : d.action === "ask" ? "ask" : d.reason;
    assert.equal(got, want);
    if (cmd !== undefined && d.action === "send") assert.equal(d.text, cmd);
  });
}

test("English base words work whatever the band language", () => {
  assert.equal(decideUtterance("water", "fr").action, "send");
  assert.equal(decideUtterance("help", "es").action, "send");
});

test("sameUtterance ignores case, accents and punctuation", () => {
  assert.ok(sameUtterance("Water!", "water"));
  assert.ok(sameUtterance("De l’eau", "de l'eau"));
  assert.ok(!sameUtterance("water", "toilet"));
  assert.ok(!sameUtterance("", ""));
});

test("nothing the band says out loud is an emergency phrase (it may be heard while the band speaks)", async () => {
  const { STRINGS, LANGUAGES } = await import("@/app/band/_lib/i18n");
  for (const l of LANGUAGES) {
    const s = STRINGS[l];
    for (const line of [s.alreadySent, s.helpComing, s.onTheWay, s.nurseOnTheWay, s.areYouOk, s.fallDetected, s.spokenCalled, s.wakeYes, s.stayCalm, s.nurseWillCheck]) {
      const d = decideUtterance(line.replace("{nurse}", "Amara"), l);
      assert.ok(!(d.action === "send" && d.kind === "emergency"), `${l}: "${line}"`);
    }
  }
});

test("band copy: no emoji, no dashes, sentence case, polite FR/ES", async () => {
  const { STRINGS, LANGUAGES } = await import("@/app/band/_lib/i18n");
  const { PATIENT_MESSAGES } = await import("./voice");
  for (const l of LANGUAGES) {
    const lines = [...Object.values(STRINGS[l]), ...[1, 2, 3].map((p) => PATIENT_MESSAGES[p as 1 | 2 | 3][l])];
    for (const line of lines) {
      assert.ok(!/\p{Extended_Pictographic}/u.test(line), `${l} emoji: ${line}`);
      assert.ok(!/[—–]/.test(line), `${l} dash: ${line}`);
      assert.ok(!/\b[A-Z]{3,}\b/.test(line.replace(/\bOK\b/g, "")), `${l} all caps: ${line}`);
      const word = (w: string) => new RegExp(`(?<!\\p{L})(${w})(?!\\p{L})`, "iu");
      if (l === "fr") assert.ok(!word("tu|te|ton|ta|tes").test(line) && !line.includes("'"), `fr: ${line}`);
      if (l === "es") assert.ok(!word("tú|tienes|puedes|quédate|toca").test(line), `es: ${line}`);
    }
  }
});
