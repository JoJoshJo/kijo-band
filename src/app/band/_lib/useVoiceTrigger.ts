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
  /** Chrome 139+ / Edge: true → recognise on the device, audio never goes to a speech server. */
  processLocally?: boolean;
  start(): void;
  abort(): void;
}
type Availability = "available" | "downloadable" | "downloading" | "unavailable";
interface SpeechRecognitionOptionsLike {
  langs: string[];
  processLocally: boolean;
}
type SpeechRecognitionCtor = (new () => SpeechRecognitionLike) & {
  available?: (o: SpeechRecognitionOptionsLike) => Promise<Availability>;
  install?: (o: SpeechRecognitionOptionsLike) => Promise<boolean>;
};

const SPEECH_LANG: Record<Language, string> = { en: "en-US", fr: "fr-FR", es: "es-ES" };
const FATAL_ERRORS = new Set(["not-allowed", "service-not-allowed", "audio-capture", "language-not-supported"]);
const TALK_TIMEOUT_MS = 10_000; // tap-and-talk gives up after this with no final sentence

function getRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: SpeechRecognitionCtor; webkitSpeechRecognition?: SpeechRecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

// ── On-device recognition (where the browser has it) ──
// Per language tag: true once the on-device model is installed. Filled asynchronously by
// checkOnDevice(); until then (and wherever the API is missing) recognition keeps the browser default.
const onDevice = new Map<string, boolean>();
const checking = new Set<string>();

async function checkOnDevice(Ctor: SpeechRecognitionCtor, tag: string) {
  if (onDevice.get(tag) || checking.has(tag) || typeof Ctor.available !== "function") return;
  checking.add(tag);
  const opts = { langs: [tag], processLocally: true };
  try {
    const status = await Ctor.available(opts);
    if (status === "available") onDevice.set(tag, true);
    else if ((status === "downloadable" || status === "downloading") && typeof Ctor.install === "function") {
      // Fetch the language pack in the background; this session stays on the default recogniser
      // until it is installed. No UI: it just gets better next time.
      onDevice.set(tag, (await Ctor.install(opts)) === true);
    } else onDevice.set(tag, false);
  } catch {
    onDevice.set(tag, false); // blocked by Permissions-Policy, not allowed yet, etc.
  } finally {
    checking.delete(tag);
  }
}

/** Ask for on-device processing when the model for `tag` is installed; otherwise leave the default. */
function preferOnDevice(rec: SpeechRecognitionLike, tag: string) {
  if (!("processLocally" in rec)) return;
  rec.processLocally = onDevice.get(tag) === true;
}

/** An on-device start failed: fall back to the default recogniser for this language. */
function onDeviceFailed(rec: SpeechRecognitionLike, tag: string, error: string) {
  if (rec.processLocally && (error === "language-not-supported" || error === "service-not-allowed")) {
    onDevice.set(tag, false);
    return true;
  }
  return false;
}

/**
 * Speech recognition in the resident's language. Audio never leaves the browser's recognizer;
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

  // Check (and quietly install) the on-device model for the current language.
  useEffect(() => {
    const Ctor = getRecognitionCtor();
    if (Ctor) void checkOnDevice(Ctor, SPEECH_LANG[lang]);
  }, [lang]);

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
    const tag = SPEECH_LANG[lang];
    rec.lang = tag;
    rec.continuous = false;
    rec.interimResults = true;
    preferOnDevice(rec, tag);
    let done = false;
    let retried = false;
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
    rec.onerror = (e) => {
      if (!retried && onDeviceFailed(rec, tag, e.error)) retried = true; // onend restarts it on the default recogniser
      else finish();
    };
    rec.onend = () => {
      if (retried && !done) {
        retried = false;
        preferOnDevice(rec, tag);
        try {
          rec.start();
          return;
        } catch {
          // fall through
        }
      }
      finish();
    };
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
    const tag = SPEECH_LANG[lang];
    rec.lang = tag;
    rec.continuous = true;
    rec.interimResults = true;
    preferOnDevice(rec, tag);

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
      if (onDeviceFailed(rec, tag, e.error)) return; // restart below uses the default recogniser
      if (FATAL_ERRORS.has(e.error)) stopped = true; // permission denied etc. → don't loop
    };
    rec.onend = () => {
      setListening(false);
      if (stopped) return;
      restartTimer = setTimeout(() => {
        preferOnDevice(rec, tag); // picks up a model that finished installing meanwhile
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
