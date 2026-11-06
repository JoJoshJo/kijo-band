// Guest name rule for /join (client and server share it): required, trimmed, 2–20 characters,
// letters (any alphabet, with accents) plus spaces, hyphens and apostrophes, at least one letter.

import type { Language } from "./types";

export const NAME_MIN = 2;
export const NAME_MAX = 20;
const ALLOWED = /^[\p{L}\p{M}' ’-]+$/u;
const LETTER = /\p{L}/u;

export type NameError = "required" | "too_short" | "too_long" | "invalid_chars";

/** Trims and collapses inner whitespace. */
export function normalizeName(v: string): string {
  return v.replace(/\s+/g, " ").trim();
}

/** Returns the cleaned name, or an error code. */
export function validateName(v: unknown): { ok: true; name: string } | { ok: false; error: NameError } {
  if (typeof v !== "string") return { ok: false, error: "required" };
  const name = normalizeName(v);
  if (name.length === 0) return { ok: false, error: "required" };
  if (name.length > NAME_MAX) return { ok: false, error: "too_long" };
  if (!ALLOWED.test(name) || !LETTER.test(name)) return { ok: false, error: "invalid_chars" };
  if ([...name].length < NAME_MIN) return { ok: false, error: "too_short" };
  return { ok: true, name };
}

export const NAME_ERROR_TEXT: Record<Language, Record<NameError, string>> = {
  en: {
    required: "Please enter your name.",
    too_short: "Your name needs at least 2 letters.",
    too_long: "Please keep your name to 20 characters.",
    invalid_chars: "Use letters only — spaces, hyphens and apostrophes are fine.",
  },
  fr: {
    required: "Veuillez entrer votre prénom.",
    too_short: "Votre prénom doit avoir au moins 2 lettres.",
    too_long: "Votre prénom doit faire 20 caractères au maximum.",
    invalid_chars: "Lettres uniquement — espaces, tirets et apostrophes acceptés.",
  },
  es: {
    required: "Escriba su nombre, por favor.",
    too_short: "Su nombre necesita al menos 2 letras.",
    too_long: "Su nombre debe tener 20 caracteres como máximo.",
    invalid_chars: "Solo letras — se admiten espacios, guiones y apóstrofos.",
  },
};
