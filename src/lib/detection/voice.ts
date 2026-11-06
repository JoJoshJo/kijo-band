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

// ── Background listening: "Kijo" wake word + emergency words ──
// Residents who can't move or tap say "Kijo, …" (or "Kijo" … "Yes?" … then the request). Emergency
// words work WITHOUT the wake word. Everything else said in the room is ignored.

/** Emergency phrases (normalized) — trigger without the wake word. English is accepted for everyone. */
export const EMERGENCY_PHRASES: Record<Language, string[]> = {
  en: [
    "help", "help me", "emergency", "i fell", "ive fallen", "i have fallen", "i fell down",
    "cant breathe", "cannot breathe", "i cant breathe", "chest pain", "heart attack",
  ],
  fr: [
    "au secours", "a l aide", "aidez moi", "je suis tombe", "je suis tombee", "urgence",
    "je ne peux pas respirer", "j arrive pas a respirer", "je n arrive pas a respirer", "je respire pas",
    "douleur a la poitrine", "mal a la poitrine", "crise cardiaque",
  ],
  es: [
    "ayuda", "ayudeme", "ayudenme", "ayudame", "socorro", "auxilio", "me cai", "me he caido", "emergencia",
    "no puedo respirar", "dolor de pecho", "dolor en el pecho", "infarto",
  ],
};

/**
 * How recognizers spell "Kijo" (normalized; one or two words). Two-word variants only count as a pair.
 * Deliberately excludes real words that sound close ("key", "kilo", "quijote", "queso", "kiwi").
 */
export const WAKE_VARIANTS: string[][] = [
  ["kijo"], ["kiyo"], ["kijou"], ["kidjo"], ["quijo"], ["keejo"], ["keyjo"], ["kijoe"], ["kiyoh"],
  ["key", "jo"], ["ki", "jo"], ["kee", "jo"], ["qui", "jo"], ["key", "joe"], ["ki", "joe"], ["kee", "joe"],
];

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
  | { kind: "emergency"; text: string }; // emergency words, no wake word needed

/** What background listening should do with one final sentence; null = ordinary talk, ignore it. */
export function backgroundIntent(text: string, lang: Language): BackgroundIntent | null {
  const wake = findWakeWord(text);
  if (wake) {
    // "Kijo" alone, but an emergency earlier in the sentence ("I fell, Kijo") → send the whole sentence.
    if (!wake.command && isEmergency(text, lang)) return { kind: "emergency", text };
    return { kind: "wake", command: wake.command };
  }
  if (isEmergency(text, lang)) return { kind: "emergency", text };
  return null;
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
