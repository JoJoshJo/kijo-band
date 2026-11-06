"use client";

import { useEffect, useRef, useState } from "react";
import type { Language } from "@/lib/types";
import { MAX_TRANSCRIPT_CHARS, containsTrigger } from "@/lib/detection/voice";

// Minimal Web Speech API typings (not in TypeScript's DOM lib).
interface SpeechRecognitionAlternativeLike {
  transcript: string;
}
interface SpeechRecognitionResultLike {
  isFinal: boolean;
  0: SpeechRecognitionAlternativeLike;
}
interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: ArrayLike<SpeechRecognitionResultLike>;
}
interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  start(): void;
  abort(): void;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

const SPEECH_LANG: Record<Language, string> = { en: "en-US", fr: "fr-FR", es: "es-ES" };
const FATAL_ERRORS = new Set(["not-allowed", "service-not-allowed", "audio-capture", "language-not-supported"]);

function getRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: SpeechRecognitionCtor; webkitSpeechRecognition?: SpeechRecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/**
 * Continuous on-device speech recognition in the resident's language. Audio never leaves the browser's
 * recognizer; when a FINAL sentence contains a trigger word, only that sentence (≤ 300 chars) is passed
 * to onTrigger. Recognition auto-restarts on `end`. `listening` is true only while actually listening.
 */
export function useVoiceTrigger({
  enabled,
  lang,
  onTrigger,
}: {
  enabled: boolean;
  lang: Language;
  onTrigger: (sentence: string) => void;
}): { listening: boolean } {
  const [listening, setListening] = useState(false);
  const onTriggerRef = useRef(onTrigger);
  useEffect(() => {
    onTriggerRef.current = onTrigger;
  }, [onTrigger]);

  useEffect(() => {
    const Ctor = enabled ? getRecognitionCtor() : null;
    if (!Ctor) return;

    let stopped = false;
    let restartTimer: ReturnType<typeof setTimeout> | null = null;
    const rec = new Ctor();
    rec.lang = SPEECH_LANG[lang];
    rec.continuous = true;
    rec.interimResults = true;

    rec.onstart = () => setListening(true);
    rec.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const result = e.results[i];
        if (!result.isFinal) continue;
        const sentence = result[0].transcript.replace(/\s+/g, " ").trim().slice(0, MAX_TRANSCRIPT_CHARS);
        if (sentence && containsTrigger(sentence, lang)) onTriggerRef.current(sentence);
      }
    };
    rec.onerror = (e) => {
      if (FATAL_ERRORS.has(e.error)) stopped = true; // permission denied etc. → don't loop
    };
    rec.onend = () => {
      setListening(false);
      if (stopped) return;
      restartTimer = setTimeout(() => {
        try {
          rec.start();
        } catch {
          // Already started or not allowed right now; the next `end` will retry.
        }
      }, 300);
    };

    try {
      rec.start();
    } catch {
      return;
    }

    return () => {
      stopped = true;
      if (restartTimer) clearTimeout(restartTimer);
      rec.onend = null;
      rec.onresult = null;
      rec.abort();
      setListening(false);
    };
  }, [enabled, lang]);

  return { listening };
}
