"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
const TALK_TIMEOUT_MS = 10_000; // tap-and-talk gives up after this with no final sentence

function getRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: SpeechRecognitionCtor; webkitSpeechRecognition?: SpeechRecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/**
 * On-device speech recognition in the resident's language. Audio never leaves the browser's recognizer;
 * only a single sentence (≤ 300 chars) is passed on.
 * - Background (when `enabled`): continuous; a FINAL sentence with a trigger word → onTrigger.
 *   Auto-restarts on `end`.
 * - Tap and talk (`talk()`): pauses the background recognizer, takes ONE sentence (no trigger word
 *   needed) → onTalk, then background resumes. Works even when background listening is off.
 * `listening` is true while the background recognizer is listening; `talking` during tap-and-talk.
 */
export function useVoiceTrigger({
  enabled,
  lang,
  onTrigger,
  onTalk,
}: {
  enabled: boolean;
  lang: Language;
  onTrigger: (sentence: string) => void;
  onTalk?: (sentence: string) => void;
}): { listening: boolean; talking: boolean; talk: () => boolean } {
  const [listening, setListening] = useState(false);
  const [talking, setTalking] = useState(false);
  const onTriggerRef = useRef(onTrigger);
  const onTalkRef = useRef(onTalk);
  useEffect(() => {
    onTriggerRef.current = onTrigger;
    onTalkRef.current = onTalk;
  }, [onTrigger, onTalk]);

  const talk = useCallback(() => {
    if (!getRecognitionCtor()) return false;
    setTalking(true);
    return true;
  }, []);

  // ── Tap and talk: one sentence ──
  useEffect(() => {
    const Ctor = talking ? getRecognitionCtor() : null;
    if (!Ctor) return;
    const rec = new Ctor();
    rec.lang = SPEECH_LANG[lang];
    rec.continuous = false;
    rec.interimResults = true;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      setTalking(false);
    };
    rec.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const result = e.results[i];
        if (!result.isFinal) continue;
        const sentence = result[0].transcript.replace(/\s+/g, " ").trim().slice(0, MAX_TRANSCRIPT_CHARS);
        if (sentence && !done) {
          onTalkRef.current?.(sentence);
          finish();
          rec.abort();
          return;
        }
      }
    };
    rec.onerror = () => finish();
    rec.onend = () => finish();
    const timer = setTimeout(() => {
      finish();
      rec.abort();
    }, TALK_TIMEOUT_MS);
    try {
      rec.start();
    } catch {
      clearTimeout(timer);
      queueMicrotask(finish);
      return;
    }
    return () => {
      clearTimeout(timer);
      rec.onend = null;
      rec.onresult = null;
      rec.onerror = null;
      rec.abort();
    };
  }, [talking, lang]);

  // ── Background: continuous, trigger words only (paused while talking) ──
  useEffect(() => {
    const Ctor = enabled && !talking ? getRecognitionCtor() : null;
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
  }, [enabled, talking, lang]);

  return { listening, talking, talk };
}
