// Voice trigger words + keyword triage (spec sections 4 and 5). Pure: used by the band (client) to decide
// which sentence to send, and by /api/triage (server) as the fallback when Claude is unavailable.
import type { AlertPriority, Language } from "@/lib/types";

export const MAX_TRANSCRIPT_CHARS = 300;

/** Lowercase, strip accents, unify apostrophes, collapse punctuation/space. */
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[’'`´]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// Phrases are written already normalized (no accents, no apostrophes).
// Spec list, plus a few spelling/gender variants and comfort needs so "Can I get some water" reaches triage.
export const TRIGGER_PHRASES: Record<Language, string[]> = {
  en: [
    "help", "emergency", "i fell", "ive fallen", "i have fallen", "i cant breathe", "i cannot breathe",
    "chest", "pain", "hurts", "nurse",
    "water", "thirsty", "bathroom", "toilet", "blanket",
  ],
  fr: [
    "au secours", "aide", "a laide", "je suis tombe", "je suis tombee", "jai mal", "urgence", "infirmiere", "infirmier",
    "eau", "soif", "toilettes", "couverture",
  ],
  es: [
    "ayuda", "emergencia", "me cai", "me duele", "enfermera", "enfermero",
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
    phrases: ["emergency", "urgence", "emergencia", "au secours", "call 911", "appelez", "llamen"],
  },
  {
    priority: 2, category: "pain", summary: "Reports pain",
    phrases: ["pain", "hurts", "hurt", "jai mal", "mal", "douleur", "me duele", "duele", "dolor"],
  },
  {
    priority: 3, category: "water", summary: "Asks for water",
    phrases: ["water", "thirsty", "drink", "eau", "soif", "boire", "agua", "sed", "beber"],
  },
  {
    priority: 3, category: "bathroom", summary: "Needs bathroom assistance",
    phrases: ["bathroom", "toilet", "restroom", "pee", "toilettes", "wc", "bano", "orinar"],
  },
  {
    priority: 3, category: "comfort", summary: "Asks for a blanket or comfort item",
    phrases: ["blanket", "cold", "tv", "television", "couverture", "froid", "tele", "manta", "frio", "television"],
  },
  {
    priority: 2, category: "help", summary: "Calls for help, request unclear",
    phrases: ["help", "nurse", "aide", "a laide", "infirmiere", "infirmier", "ayuda", "enfermera", "enfermero"],
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
