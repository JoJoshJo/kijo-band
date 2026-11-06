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

// ── "Kijo" wake word + emergency words (background listening) ──
import { backgroundIntent, findWakeWord, isEmergency, wordCount } from "./voice";

test("wake word: command is what follows, original wording kept (EN/FR/ES)", () => {
  assert.deepEqual(findWakeWord("Kijo, I need some water"), { command: "I need some water" });
  assert.deepEqual(findWakeWord("kijo j’ai besoin d’aller aux toilettes"), { command: "j’ai besoin d’aller aux toilettes" });
  assert.deepEqual(findWakeWord("Kijo: ¿me puede traer agua?"), { command: "me puede traer agua?" });
  assert.deepEqual(findWakeWord("ok Kijo… my knee hurts"), { command: "my knee hurts" });
  assert.deepEqual(findWakeWord("Kijo"), { command: "" });
  assert.deepEqual(findWakeWord("Kijo!"), { command: "" });
});

test("wake word: recognizer variants", () => {
  for (const v of ["kijo", "Kiyo", "key jo", "Key-jo", "kijou", "Kidjo", "quijo", "ki jo", "Kee Jo", "keyjo", "Qui jo"]) {
    assert.deepEqual(findWakeWord(`${v} water please`), { command: "water please" }, v);
  }
});

test("wake word: no false triggers on close-sounding words", () => {
  for (const s of [
    "Where is my key", "Joe is coming at noon", "I lost a kilo", "Tokyo is far", "The kitchen is closed",
    "Quiero queso", "Don Quijote", "Kiwi juice", "ki", "jo", "the key, Jo", "Keep going",
  ]) {
    assert.equal(findWakeWord(s), null, s);
  }
});

test("emergency phrases trigger without the wake word, at any length", () => {
  for (const [s, l] of [
    ["I fell", "en"], ["I can't breathe", "en"], ["Je suis tombée", "fr"], ["Je n’arrive pas à respirer", "fr"],
    ["Me caí", "es"], ["No puedo respirar", "es"],
    ["Oh no I think I fell in the bathroom and I can't get up", "en"],
    ["Je crois que je suis tombée dans la salle de bain ce matin", "fr"],
    ["Ay Dios mío me caí al lado de la cama otra vez", "es"],
  ] as const) {
    assert.deepEqual(backgroundIntent(s, l), { kind: "emergency", text: s }, s);
  }
});

test("short base words trigger without the wake word (EN/FR/ES, every need)", () => {
  for (const [s, l, need] of [
    ["Help!", "en", "help"], ["Help me", "en", "help"], ["I need help", "en", "help"], ["Nurse!", "en", "help"],
    ["Water", "en", "water"], ["Some water please", "en", "water"], ["I need water", "en", "water"],
    ["Toilet", "en", "toilet"], ["Toilet please", "en", "toilet"], ["I need the bathroom", "en", "toilet"],
    ["Restroom", "en", "toilet"], ["It hurts", "en", "pain"], ["I'm in pain", "en", "pain"],
    ["Aide", "fr", "help"], ["À l’aide !", "fr", "help"], ["Aidez-moi", "fr", "help"], ["Au secours", "fr", "help"],
    ["De l’eau", "fr", "water"], ["De l'eau s'il vous plaît", "fr", "water"], ["J’ai soif", "fr", "water"],
    ["Les toilettes", "fr", "toilet"], ["Pipi", "fr", "toilet"], ["J’ai mal", "fr", "pain"], ["Douleur", "fr", "pain"],
    ["¡Ayuda!", "es", "help"], ["Ayúdeme", "es", "help"], ["Socorro", "es", "help"],
    ["Agua", "es", "water"], ["Tengo sed", "es", "water"], ["El baño", "es", "toilet"], ["Baño por favor", "es", "toilet"],
    ["Me duele", "es", "pain"], ["Dolor", "es", "pain"], ["water", "fr", "water"], ["help", "es", "help"],
  ] as const) {
    assert.deepEqual(backgroundIntent(s, l), { kind: "base", text: s, need }, s);
  }
});

test("base words in longer chatter (> 6 words) are ignored without Kijo", () => {
  for (const [s, l] of [
    ["Can you help me with the TV remote please", "en"], ["The water in this glass is too cold today", "en"],
    ["My grandson said the bathroom upstairs is being painted", "en"], ["He has back pain since he started that new job", "en"],
    ["Il faut que je pense à boire de l’eau demain", "fr"], ["Ma fille m’a dit que les toilettes sont en travaux", "fr"],
    ["Mi hijo necesita ayuda con los deberes de la escuela", "es"], ["El agua de la piscina estaba muy fría ayer", "es"],
  ] as const) {
    assert.equal(backgroundIntent(s, l), null, s);
  }
});

test("everyday talk without Kijo, base words or emergency phrases is ignored", () => {
  for (const [s, l] of [
    ["What's on TV tonight", "en"], ["Good morning", "en"], ["Bonjour, ça va bien", "fr"], ["Pas mal, merci", "fr"],
    ["Il fait froid", "fr"], ["Buenos días", "es"], ["¿Qué hora es?", "es"], ["Gracias", "es"],
  ] as const) {
    assert.equal(backgroundIntent(s, l), null, s);
  }
});

test("Kijo still works for long requests and anything at all", () => {
  assert.deepEqual(
    backgroundIntent("Kijo, can you ask someone to bring me some water and close the window", "en"),
    { kind: "wake", command: "can you ask someone to bring me some water and close the window" },
  );
  assert.deepEqual(
    backgroundIntent("Kijo je voudrais qu’on ferme la fenêtre de ma chambre s’il vous plaît", "fr"),
    { kind: "wake", command: "je voudrais qu’on ferme la fenêtre de ma chambre s’il vous plaît" },
  );
  assert.deepEqual(backgroundIntent("water, Kijo", "en"), { kind: "base", text: "water, Kijo", need: "water" });
});

test("word count follows spoken words (elisions and hyphens stay one word)", () => {
  assert.equal(wordCount("De l'eau s'il vous plaît"), 5);
  assert.equal(wordCount("Aidez-moi !"), 1);
  assert.equal(wordCount("  water   water water "), 3);
});

test("Kijo + request → wake command; Kijo alone → ask; emergency + Kijo alone → emergency", () => {
  assert.deepEqual(backgroundIntent("Kijo, can I get some water", "en"), { kind: "wake", command: "can I get some water" });
  assert.deepEqual(backgroundIntent("Kijo je voudrais de l’eau", "fr"), { kind: "wake", command: "je voudrais de l’eau" });
  assert.deepEqual(backgroundIntent("Kiyo quiero ir al baño", "es"), { kind: "wake", command: "quiero ir al baño" });
  assert.deepEqual(backgroundIntent("Kijo", "fr"), { kind: "wake", command: "" });
  assert.deepEqual(backgroundIntent("Kijo help, I fell", "en"), { kind: "wake", command: "help, I fell" });
  assert.deepEqual(backgroundIntent("I fell, Kijo", "en"), { kind: "emergency", text: "I fell, Kijo" });
  assert.ok(isEmergency("I fell", "es"), "English emergency phrases work for everyone");
});
