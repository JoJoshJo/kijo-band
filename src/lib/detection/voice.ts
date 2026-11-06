// Voice trigger words + keyword triage (spec sections 4 and 5). Pure: used by the band (client) to decide
// which sentence to send, and by /api/triage (server) as the fallback when Claude is unavailable.
import type { AlertPriority, Language } from "@/lib/types";

export const MAX_TRANSCRIPT_CHARS = 300;

const APOSTROPHES = /[\u0027\u2018\u2019\u02BC\u0060\u00B4]/g; // ' ‘ ’ ʼ ` ´ (recognisers use either)
// French elision at the start of a word: l'eau, d'aide, j'ai, qu'il … → "l eau", "d aide", "j ai".
const ELISION = /(^|[^a-z])(l|d|j|m|n|s|t|c|qu|jusqu|lorsqu|puisqu)'/g;

/**
 * Lowercase, strip accents (NFD), unify apostrophes, split French elisions into their own word,
 * drop the remaining apostrophes (English "can't" → "cant"), collapse punctuation/space.
 */
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(APOSTROPHES, "'")
    .replace(ELISION, "$1$2 ")
    .replace(/'/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// Phrases are written already normalized (no accents; French elisions split: "j ai", "l eau").
// Spec list, plus a few spelling/gender variants and comfort needs so "Can I get some water" reaches triage.
export const TRIGGER_PHRASES: Record<Language, string[]> = {
  en: [
    "help", "emergency", "i fell", "ive fallen", "i have fallen", "i cant breathe", "i cannot breathe",
    "chest", "pain", "hurts", "nurse",
    "water", "thirsty", "bathroom", "toilet", "blanket",
  ],
  fr: [
    "au secours", "secours", "aide", "aidez", "aidez moi", "aider", "je suis tombe", "je suis tombee", "tombe", "tombee",
    "j ai mal", "douleur", "urgence", "urgent", "infirmiere", "infirmier",
    "eau", "soif", "boire", "toilettes", "toilette", "wc", "couverture",
  ],
  es: [
    "ayuda", "ayudeme", "ayudenme", "ayudame", "socorro", "auxilio", "emergencia", "urgencia",
    "me cai", "me he caido", "caido", "caida", "me duele", "dolor", "enfermera", "enfermero",
    "agua", "sed", "bano", "manta",
  ],
};

function hasPhrase(norm: string, phrase: string): boolean {
  return ` ${norm} `.includes(` ${phrase} `);
}

/**
 * True if the sentence contains a trigger word in the resident's language. English triggers are also
 * accepted for every resident ("help" is understood everywhere, and recognition sometimes returns English).
 */
export function containsTrigger(text: string, lang: Language): boolean {
  const norm = normalize(text);
  if (!norm) return false;
  const phrases = lang === "en" ? TRIGGER_PHRASES.en : [...TRIGGER_PHRASES[lang], ...TRIGGER_PHRASES.en];
  return phrases.some((p) => hasPhrase(norm, p));
}

// ── Background listening: "Kijo" wake word, base words, emergency phrases ──
// - Emergency phrases (a fall, can't breathe, chest pain) work WITHOUT the wake word, at any length.
// - Base words (help / water / toilet / pain) work WITHOUT the wake word only in a SHORT utterance
//   (≤ BASE_MAX_WORDS words: "water", "toilet please", "I need help"); longer sentences that merely
//   contain them (TV, conversation) are ignored unless they start with "Kijo".
// - "Kijo, …" (or "Kijo" … "Yes?" … then the request) works for anything.
// Everything else said in the room is ignored. English is accepted for every resident.

/** Emergency phrases (normalized) — trigger without the wake word, whatever the sentence length. */
export const EMERGENCY_PHRASES: Record<Language, string[]> = {
  en: [
    "i fell", "ive fallen", "i have fallen", "i fell down",
    "cant breathe", "cannot breathe", "i cant breathe", "chest pain", "heart attack",
  ],
  fr: [
    "je suis tombe", "je suis tombee",
    "je ne peux pas respirer", "j arrive pas a respirer", "je n arrive pas a respirer", "je respire pas",
    "douleur a la poitrine", "mal a la poitrine", "crise cardiaque",
  ],
  es: [
    "me cai", "me he caido",
    "no puedo respirar", "dolor de pecho", "dolor en el pecho", "infarto",
  ],
};

/** A base word counts without the wake word only in an utterance of at most this many words. */
export const BASE_MAX_WORDS = 6;

/** Base words (normalized) by need — trigger without the wake word in a short utterance. */
export const BASE_PHRASES: Record<Language, Record<"help" | "water" | "toilet" | "pain", string[]>> = {
  en: {
    help: ["help", "help me", "i need help", "emergency", "nurse"],
    water: ["water", "thirsty"],
    toilet: ["toilet", "bathroom", "restroom", "loo"],
    pain: ["pain", "it hurts", "hurts", "im in pain"],
  },
  fr: {
    help: ["aide", "a l aide", "aidez moi", "aidez", "au secours", "secours", "urgence", "infirmiere", "infirmier"],
    water: ["eau", "de l eau", "j ai soif", "soif"],
    toilet: ["toilettes", "les toilettes", "toilette", "pipi", "wc"],
    // not "mal" alone: "pas mal" means "not bad"
    pain: ["j ai mal", "douleur", "ca fait mal"],
  },
  es: {
    help: ["ayuda", "ayudeme", "ayudenme", "ayudame", "socorro", "auxilio", "emergencia", "enfermera", "enfermero"],
    water: ["agua", "tengo sed", "sed"],
    toilet: ["bano", "el bano"],
    pain: ["me duele", "dolor", "duele"],
  },
};

/**
 * How recognizers spell "Kijo" (normalized; one or two words). Two-word variants only count as a pair.
 * Deliberately excludes real words that sound close ("key", "kilo", "quijote", "queso", "kiwi").
 */
export const WAKE_VARIANTS: string[][] = [
  ["kijo"], ["kiyo"], ["kijou"], ["kidjo"], ["quijo"], ["keejo"], ["keyjo"], ["kijoe"], ["kiyoh"],
  ["key", "jo"], ["ki", "jo"], ["kee", "jo"], ["qui", "jo"], ["key", "joe"], ["ki", "joe"], ["kee", "joe"],
];

/** Spoken words in the utterance (as said: "l’eau" is one word, "Aidez-moi" is one word). */
export function wordCount(text: string): number {
  return text.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
}

export type BaseNeed = keyof (typeof BASE_PHRASES)["en"];

/** Which need a short utterance asks for, or null (also null when it is longer than BASE_MAX_WORDS). */
export function baseNeed(text: string, lang: Language): BaseNeed | null {
  if (wordCount(text) > BASE_MAX_WORDS) return null;
  return baseNeedAnyLength(text, lang);
}

/** The need named by a base word anywhere in the text, whatever its length. */
function baseNeedAnyLength(text: string, lang: Language): BaseNeed | null {
  const norm = normalize(text);
  if (!norm) return null;
  const sets = lang === "en" ? [BASE_PHRASES.en] : [BASE_PHRASES[lang], BASE_PHRASES.en];
  for (const need of ["help", "pain", "toilet", "water"] as const) {
    if (sets.some((set) => set[need].some((p) => hasPhrase(norm, p)))) return need;
  }
  return null;
}

export function isEmergency(text: string, lang: Language): boolean {
  const norm = normalize(text);
  if (!norm) return false;
  const phrases = lang === "en" ? EMERGENCY_PHRASES.en : [...EMERGENCY_PHRASES[lang], ...EMERGENCY_PHRASES.en];
  return phrases.some((p) => hasPhrase(norm, p));
}

/**
 * Finds the wake word. `command` is what was said AFTER it in the same utterance, in the ORIGINAL
 * wording (accents kept, leading punctuation dropped) — "" if nothing followed.
 */
export function findWakeWord(text: string): { command: string } | null {
  // Words in order, each with the end offset of the original chunk it came from.
  // `joined`: this word continues the previous one with only a space/hyphen between ("Key jo", "Key-jo"),
  // so a two-word variant can't span punctuation ("the key, Jo").
  const words: { w: string; end: number; joined: boolean }[] = [];
  let prevChunk = "";
  for (const m of text.matchAll(/\S+/g)) {
    const end = (m.index ?? 0) + m[0].length;
    const parts = normalize(m[0]).split(" ").filter(Boolean);
    const chunkJoined = /[\p{L}\p{N}]$/u.test(prevChunk) && /^[\p{L}\p{N}]/u.test(m[0]);
    parts.forEach((w, k) => words.push({ w, end, joined: k > 0 ? /^[\p{L}\p{N}]+-[\p{L}\p{N}]/u.test(m[0]) : chunkJoined }));
    prevChunk = m[0];
  }
  for (let i = 0; i < words.length; i++) {
    for (const v of WAKE_VARIANTS) {
      if (v.every((part, k) => words[i + k]?.w === part && (k === 0 || words[i + k].joined))) {
        const end = words[i + v.length - 1].end;
        const command = text
          .slice(end)
          .replace(/^[\s,.;:!?¡¿…\-–—'"“”«»]+/u, "")
          .trim()
          .slice(0, MAX_TRANSCRIPT_CHARS);
        return { command };
      }
    }
  }
  return null;
}

export type BackgroundIntent =
  | { kind: "wake"; command: string } // "Kijo, …" (command "" → ask "Yes?" and take the next utterance)
  | { kind: "emergency"; text: string } // fall / breathing / chest phrases, any length, no wake word
  | { kind: "base"; text: string; need: "help" | "water" | "toilet" | "pain" }; // short base-word request

/**
 * What background listening should do with one final sentence; null = ordinary talk, ignore it.
 * Everything that triggers is sent to /api/triage as before (Claude sets priority + summary).
 */
export function backgroundIntent(text: string, lang: Language): BackgroundIntent | null {
  const wake = findWakeWord(text);
  if (wake) {
    if (wake.command) return { kind: "wake", command: wake.command };
    // "Kijo" alone, but a request earlier in the sentence ("I fell, Kijo", "water, Kijo") → send it all.
    if (isEmergency(text, lang)) return { kind: "emergency", text };
    const need = baseNeed(text, lang);
    if (need) return { kind: "base", text, need };
    return { kind: "wake", command: "" };
  }
  if (isEmergency(text, lang)) return { kind: "emergency", text };
  const need = baseNeed(text, lang);
  if (need) return { kind: "base", text, need };
  return null;
}

/** Why background listening did or didn't act on an utterance (shown in the ?debug=1 panel). */
export type VoiceDecision =
  | { action: "send"; kind: "base" | "emergency" | "wake"; text: string; need?: BaseNeed }
  | { action: "ask" } // "Kijo" alone → chime + "Yes?" → take the next utterance
  | { action: "ignore"; reason: "too-long" | "no-trigger" | "empty" };

/**
 * The single source of truth for background listening (no tap):
 * 1. "Kijo …" → everything after it (any length). "Kijo" alone → ask.
 * 2. Emergency phrases → always (any length).
 * 3. Base words (help / water / toilet / pain) → only in a short utterance (≤ 6 words).
 * 4. Anything else → ignored ("too-long" when it named a need but was longer than 6 words).
 */
export function decideUtterance(text: string, lang: Language): VoiceDecision {
  const t = text.replace(/\s+/g, " ").trim().slice(0, MAX_TRANSCRIPT_CHARS);
  if (!normalize(t)) return { action: "ignore", reason: "empty" };
  const intent = backgroundIntent(t, lang);
  if (intent?.kind === "wake") return intent.command ? { action: "send", kind: "wake", text: intent.command } : { action: "ask" };
  if (intent?.kind === "emergency") return { action: "send", kind: "emergency", text: intent.text };
  if (intent?.kind === "base") return { action: "send", kind: "base", text: intent.text, need: intent.need };
  return { action: "ignore", reason: baseNeedAnyLength(t, lang) ? "too-long" : "no-trigger" };
}

/** Same request again? (dedupe key: normalized text) */
export function sameUtterance(a: string, b: string): boolean {
  const na = normalize(a);
  return !!na && na === normalize(b);
}

export interface TriageResult {
  priority: AlertPriority;
  category: string;
  /** English, ≤ 15 words, key fact first — for the nurse. */
  summary: string;
  /** Calm reassurance in the resident's language. Never medical advice. */
  patientMessage: string;
}

interface Rule {
  priority: AlertPriority;
  category: string;
  summary: string;
  /** Normalized phrases, any language. */
  phrases: string[];
}

// Checked in order: critical first, then explicit pain, then comfort needs, then generic calls for help.
const RULES: Rule[] = [
  {
    priority: 1, category: "breathing", summary: "Reports trouble breathing",
    phrases: ["cant breathe", "cannot breathe", "breathe", "breathing", "respirer", "respire pas", "respirar", "no puedo respirar", "ahogo"],
  },
  {
    priority: 1, category: "chest_pain", summary: "Reports chest pain or pressure",
    phrases: ["chest", "poitrine", "pecho", "heart attack", "crise cardiaque", "infarto"],
  },
  {
    priority: 1, category: "fall", summary: "Says they fell",
    phrases: ["i fell", "ive fallen", "i have fallen", "fell down", "je suis tombe", "je suis tombee", "tombe", "tombee", "me cai", "me he caido", "caido", "caida"],
  },
  {
    priority: 1, category: "emergency", summary: "Calls for emergency help",
    phrases: ["emergency", "urgence", "emergencia", "urgencia", "au secours", "secours", "socorro", "auxilio", "call 911", "appelez", "llamen"],
  },
  {
    priority: 2, category: "pain", summary: "Reports pain",
    phrases: ["pain", "hurts", "hurt", "j ai mal", "mal", "douleur", "me duele", "duele", "dolor"],
  },
  {
    priority: 3, category: "water", summary: "Asks for water",
    phrases: ["water", "thirsty", "drink", "eau", "soif", "boire", "agua", "sed", "beber"],
  },
  {
    priority: 3, category: "bathroom", summary: "Needs bathroom assistance",
    phrases: ["bathroom", "toilet", "restroom", "pee", "toilettes", "toilette", "wc", "bano", "orinar"],
  },
  {
    priority: 3, category: "comfort", summary: "Asks for a blanket or comfort item",
    phrases: ["blanket", "cold", "tv", "television", "couverture", "froid", "tele", "manta", "frio", "television"],
  },
  {
    priority: 2, category: "help", summary: "Calls for help, request unclear",
    phrases: ["help", "nurse", "aide", "aidez", "aider", "infirmiere", "infirmier", "ayuda", "ayudeme", "ayudenme", "ayudame", "enfermera", "enfermero"],
  },
];

export const PATIENT_MESSAGES: Record<AlertPriority, Record<Language, string>> = {
  1: {
    en: "Help is coming right now. Stay still.",
    fr: "Quelqu'un arrive tout de suite. Ne bougez pas.",
    es: "La ayuda viene ahora mismo. Quédese quieto.",
  },
  2: {
    en: "A nurse is coming to help you.",
    fr: "Quelqu'un arrive pour vous aider.",
    es: "Alguien viene a ayudarle.",
  },
  3: {
    en: "Got it. Someone will be with you soon.",
    fr: "C'est noté. Quelqu'un arrive bientôt.",
    es: "Entendido. Alguien vendrá pronto.",
  },
};

/** Deterministic keyword triage — the fallback that keeps the demo working without Claude. */
export function keywordTriage(transcript: string, lang: Language): TriageResult {
  const norm = normalize(transcript);
  const rule = RULES.find((r) => r.phrases.some((p) => hasPhrase(norm, p)));
  const priority: AlertPriority = rule?.priority ?? 2;
  return {
    priority,
    category: rule?.category ?? "unclear",
    summary: `${rule?.summary ?? "Voice call, request unclear"} (voice, ${lang.toUpperCase()})`,
    patientMessage: PATIENT_MESSAGES[priority][lang],
  };
}
