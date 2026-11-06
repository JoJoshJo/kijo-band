"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Language } from "@/lib/types";
import { MAX_TRANSCRIPT_CHARS, backgroundIntent, findWakeWord } from "@/lib/detection/voice";
import { SPEECH_LANG } from "./speechLang";

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

// Errors that won't go away by retrying: permission / Siri & Dictation off / no microphone / language.
const BLOCKING_ERRORS = new Set(["not-allowed", "service-not-allowed", "audio-capture", "language-not-supported"]);
const TALK_TIMEOUT_MS = 10_000; // tap-and-talk gives up after this with no final sentence
const START_WATCHDOG_MS = 4000; // no `start` event by then → the engine silently refused (iOS home-screen app)
const MAX_QUICK_FAILS = 3; // background restarts that end without ever starting → ask for a tap
const RESTART_DELAY_MS = 300;
const WAKE_CAPTURE_MS = 8000; // after "Kijo" alone + "Yes?": the next utterance within this is the request

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

/** Dev only: recognizer path, language and errors. Never the transcript. */
function vlog(msg: string) {
  if (process.env.NODE_ENV !== "production") console.debug(`[voice] ${msg}`);
}

const clean = (t: string) => t.replace(/\s+/g, " ").trim().slice(0, MAX_TRANSCRIPT_CHARS);

/**
 * iOS speech recognition only really works in Safari itself: the home-screen app (standalone) and other
 * iOS browsers (Chrome, Firefox, Edge — WKWebView) expose webkitSpeechRecognition, but it never starts or
 * fails with service-not-allowed. Returns null when not on iOS.
 */
export function iosVoiceContext(): "safari" | "standalone" | "other-browser" | null {
  if (typeof navigator === "undefined") return null;
  const ua = navigator.userAgent;
  const ios = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  if (!ios) return null;
  const standalone =
    (navigator as Navigator & { standalone?: boolean }).standalone === true ||
    window.matchMedia?.("(display-mode: standalone)").matches;
  if (standalone) return "standalone";
  if (/CriOS|FxiOS|EdgiOS|OPiOS|GSA\//.test(ua)) return "other-browser";
  return "safari";
}

/** Why voice can't be used right now (shown as a one-line hint; the buttons always work). */
export type VoiceProblem = "unsupported" | "open-in-safari" | "dictation-off" | "mic-blocked";

/** Map a blocking error / silent refusal to what the resident (or helper) can do about it. */
function classify(reason: string): VoiceProblem {
  const ios = iosVoiceContext();
  if (ios === "standalone" || ios === "other-browser") return "open-in-safari";
  if (reason === "language-not-supported") return "unsupported";
  if (ios === "safari" && (reason === "not-allowed" || reason === "service-not-allowed")) return "dictation-off";
  return "mic-blocked";
}

/**
 * Speech recognition in the resident's language (recognizer lang = the band's CURRENT language:
 * en-US / fr-FR / es-ES). Audio never leaves the browser's recognizer; only one sentence (≤ 300 chars)
 * is passed on. Chrome/Edge recognise on the device where the model is installed (processLocally);
 * iPhone Safari uses webkitSpeechRecognition.
 *
 * - Background (while `enabled` and not `paused`): continuous. A FINAL sentence goes to onTrigger when
 *   it has an emergency phrase ("I fell", "je suis tombé", "me caí"…, any length), a base word in a
 *   short utterance ("water", "toilet please", "j'ai mal" — ≤ 6 words), or what follows the wake word
 *   "Kijo" ("Kijo, I need water" → "I need water"). "Kijo" alone → onWake (chime + "Yes?") and the NEXT
 *   utterance within 8 s is taken (`capturing`). Everything else is ignored. Starts by itself where the platform allows (Chrome, Android, desktop) and restarts after
 *   every `end`. iOS needs a tap to start: call `arm()` from inside the tap (Start Kijo, a language
 *   change, "Tap to resume listening"). If an automatic restart is refused, `needsTap` turns true.
 * - Tap and talk (`talk()`, call it from the tap): pauses background, starts the one-sentence recognizer
 *   synchronously inside the gesture, any sentence → onTalk, then background resumes.
 * Engines that end without marking the last result final (seen on iOS Safari) still count: the latest
 * interim sentence is used when the recognizer ends.
 */
export function useVoiceTrigger({
  enabled,
  paused = false,
  lang,
  onTrigger,
  onTalk,
  onWake,
}: {
  enabled: boolean;
  /** e.g. while the band is speaking, so it doesn't hear itself */
  paused?: boolean;
  lang: Language;
  onTrigger: (sentence: string) => void;
  onTalk?: (sentence: string) => void;
  /** "Kijo" heard with nothing after it: acknowledge (chime + "Yes?"); the next utterance is captured. */
  onWake?: () => void;
}): {
  listening: boolean;
  talking: boolean;
  /** Waiting for the request after "Kijo" */
  capturing: boolean;
  needsTap: boolean;
  problem: VoiceProblem | null;
  /** Start background listening now (call inside a tap). Optional new language (language change tap). */
  arm: (lang?: Language) => void;
  /** Tap and talk (call inside the tap). False if this browser has no speech recognition. */
  talk: () => boolean;
} {
  const [listening, setListening] = useState(false);
  const [talking, setTalking] = useState(false);
  const [needsTap, setNeedsTap] = useState(false);
  const [problem, setProblem] = useState<VoiceProblem | null>(null);
  const [capturing, setCapturing] = useState(false);

  const cb = useRef({ onTrigger, onTalk, onWake });
  const captureUntil = useRef<number | null>(null);
  const captureTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const want = useRef({ enabled, paused, lang });
  const bg = useRef<SpeechRecognitionLike | null>(null);
  const activeRec = useRef<SpeechRecognitionLike | null>(null); // the background recognizer that is listening
  const talkRec = useRef<SpeechRecognitionLike | null>(null);
  const restartTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const everStarted = useRef(false);
  const quickFails = useRef(0);
  const halted = useRef(false); // needsTap or problem: no automatic (re)starts until a tap
  const startRef = useRef<(fromGesture: boolean, l?: Language) => void>(() => {});

  useEffect(() => {
    cb.current = { onTrigger, onTalk, onWake };
  }, [onTrigger, onTalk, onWake]);

  // ── Wake word capture window ──
  const endCapture = useCallback(() => {
    if (captureTimer.current) clearTimeout(captureTimer.current);
    captureTimer.current = null;
    captureUntil.current = null;
    setCapturing(false);
  }, []);
  const armCaptureTimer = useCallback(() => {
    if (captureTimer.current) clearTimeout(captureTimer.current);
    captureUntil.current = Date.now() + WAKE_CAPTURE_MS;
    captureTimer.current = setTimeout(() => {
      vlog("wake: no request within 8 s");
      endCapture();
    }, WAKE_CAPTURE_MS);
  }, [endCapture]);

  /** One final sentence from background listening (lang = the recognizer's language). */
  const heard = useCallback(
    (sentence: string, l: Language) => {
      if (!sentence) return;
      if (captureUntil.current != null && Date.now() <= captureUntil.current) {
        const text = findWakeWord(sentence)?.command ?? sentence; // "Kijo" said again → wait for the rest
        if (!text) return;
        vlog("wake: request captured");
        endCapture();
        cb.current.onTrigger(text);
        return;
      }
      const intent = backgroundIntent(sentence, l);
      if (!intent) return;
      if (intent.kind === "emergency") {
        vlog("emergency phrase");
        cb.current.onTrigger(intent.text);
      } else if (intent.kind === "base") {
        vlog(`base word (${intent.need}), short utterance`);
        cb.current.onTrigger(intent.text);
      } else if (intent.command) {
        vlog("wake word + request");
        cb.current.onTrigger(intent.command);
      } else {
        vlog("wake word alone → Yes?");
        setCapturing(true);
        armCaptureTimer();
        cb.current.onWake?.();
      }
    },
    [armCaptureTimer, endCapture],
  );

  const halt = useCallback((fromGesture: boolean, reason: string) => {
    // A refused AUTOMATIC restart after listening worked before (iOS: no gesture) → one tap re-arms.
    const refusedRestart = !fromGesture && everStarted.current;
    const blocking = BLOCKING_ERRORS.has(reason);
    halted.current = true;
    if (refusedRestart || (!blocking && iosVoiceContext() !== "standalone" && iosVoiceContext() !== "other-browser")) {
      vlog(`halted (${reason}) → needs a tap`);
      setNeedsTap(true);
    } else {
      const p = classify(reason);
      vlog(`halted (${reason}) → ${p}`);
      setProblem(p);
    }
  }, []);

  const stopBackground = useCallback(() => {
    if (restartTimer.current) clearTimeout(restartTimer.current);
    restartTimer.current = null;
    const r = bg.current;
    bg.current = null;
    if (r) {
      // Keep onend: it clears `listening` when the abort lands (no setState here — runs inside effects).
      r.onstart = r.onresult = r.onerror = null;
      try {
        r.abort();
      } catch {
        // already stopped
      }
    }
  }, []);

  const startBackground = useCallback(
    (fromGesture: boolean, langOverride?: Language) => {
      const Ctor = getRecognitionCtor();
      const w = want.current;
      if (!Ctor || !w.enabled || w.paused || talkRec.current || bg.current) return;
      if (halted.current && !fromGesture) return;
      const l = langOverride ?? w.lang;
      const tag = SPEECH_LANG[l];
      const rec = new Ctor();
      rec.lang = tag;
      rec.continuous = true;
      rec.interimResults = true;
      preferOnDevice(rec, tag);
      bg.current = rec;
      let started = false;
      let blocked: string | null = null;
      let interim = ""; // latest non-final text of the current utterance

      const watchdog = setTimeout(() => {
        if (started || bg.current !== rec) return;
        vlog(`background: no start event after ${START_WATCHDOG_MS} ms`);
        stopBackground();
        halt(fromGesture, "no-start");
      }, START_WATCHDOG_MS);

      rec.onstart = () => {
        started = true;
        everStarted.current = true;
        quickFails.current = 0;
        clearTimeout(watchdog);
        activeRec.current = rec;
        setListening(true);
      };
      rec.onresult = (e) => {
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const result = e.results[i];
          const sentence = clean(result[0].transcript);
          if (!result.isFinal) {
            interim = sentence;
            continue;
          }
          interim = "";
          heard(sentence, l);
        }
      };
      rec.onerror = (e) => {
        if (e.error !== "no-speech" && e.error !== "aborted") vlog(`background error: ${e.error}`);
        if (onDeviceFailed(rec, tag, e.error)) return; // the restart uses the default recognizer
        if (BLOCKING_ERRORS.has(e.error)) blocked = e.error;
      };
      rec.onend = () => {
        clearTimeout(watchdog);
        if (activeRec.current === rec) {
          activeRec.current = null;
          setListening(false);
        }
        if (bg.current !== rec) return; // stopped on purpose
        if (interim) heard(interim, l); // ended without a final result
        interim = "";
        bg.current = null;
        if (blocked) return halt(fromGesture, blocked);
        if (!started && ++quickFails.current >= MAX_QUICK_FAILS) return halt(false, "keeps-ending");
        restartTimer.current = setTimeout(() => startRef.current(false), RESTART_DELAY_MS);
      };

      try {
        rec.start();
        vlog(`background start lang=${tag}${rec.processLocally ? " (on-device)" : ""} ${fromGesture ? "(tap)" : "(auto)"}`);
      } catch (err) {
        clearTimeout(watchdog);
        bg.current = null;
        rec.onend = null;
        vlog(`background start threw ${err instanceof Error ? err.name : err}`);
        halt(fromGesture, "start-threw");
      }
    },
    [halt, stopBackground, heard],
  );
  useEffect(() => {
    startRef.current = startBackground;
  }, [startBackground]);

  const arm = useCallback(
    (newLang?: Language) => {
      if (!getRecognitionCtor()) {
        setProblem("unsupported");
        return;
      }
      halted.current = false;
      quickFails.current = 0;
      setNeedsTap(false);
      setProblem(null);
      if (newLang) want.current = { ...want.current, lang: newLang };
      want.current = { ...want.current, enabled: true }; // the tap may come before `enabled` re-renders
      stopBackground();
      startBackground(true, newLang);
    },
    [startBackground, stopBackground],
  );

  const talk = useCallback((): boolean => {
    const Ctor = getRecognitionCtor();
    if (!Ctor) return false;
    if (talkRec.current) return true;
    endCapture(); // the tap replaces a pending "Kijo … Yes?"
    stopBackground();
    const tag = SPEECH_LANG[want.current.lang];
    const rec = new Ctor();
    rec.lang = tag;
    rec.continuous = false;
    rec.interimResults = true;
    preferOnDevice(rec, tag);
    talkRec.current = rec;
    setTalking(true);
    let done = false;
    let retried = false;
    let interim = "";
    let timer: ReturnType<typeof setTimeout> | null = null;
    const finish = (fallback = false) => {
      if (done) return;
      done = true;
      if (timer) clearTimeout(timer);
      if (fallback && interim) cb.current.onTalk?.(interim);
      rec.onresult = rec.onerror = rec.onend = null;
      try {
        rec.abort();
      } catch {
        // already stopped
      }
      talkRec.current = null;
      setTalking(false);
    };
    rec.onstart = () => {
      everStarted.current = true;
      // A working tap-and-talk proves voice is usable here: clear a stale hint.
      setProblem(null);
    };
    rec.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const result = e.results[i];
        const sentence = clean(result[0].transcript);
        if (!result.isFinal) {
          if (sentence) interim = sentence;
          continue;
        }
        if (sentence && !done) {
          cb.current.onTalk?.(findWakeWord(sentence)?.command || sentence); // "Kijo, water" → "water"
          finish();
          return;
        }
      }
    };
    rec.onerror = (e) => {
      if (e.error !== "no-speech" && e.error !== "aborted") vlog(`talk error: ${e.error}`);
      if (!retried && onDeviceFailed(rec, tag, e.error)) {
        retried = true; // onend restarts it on the default recognizer
        return;
      }
      if (BLOCKING_ERRORS.has(e.error)) {
        setProblem(classify(e.error));
        halted.current = true;
      }
      finish(true);
    };
    rec.onend = () => {
      if (retried && !done) {
        retried = false;
        preferOnDevice(rec, tag);
        try {
          rec.start();
          vlog(`talk restart lang=${tag} (default recognizer)`);
          return;
        } catch {
          // fall through
        }
      }
      finish(true);
    };
    timer = setTimeout(() => finish(true), TALK_TIMEOUT_MS);
    try {
      rec.start(); // synchronously inside the tap: iOS requires the user gesture
      vlog(`talk start lang=${tag}${rec.processLocally ? " (on-device)" : ""}`);
    } catch (err) {
      vlog(`talk start threw ${err instanceof Error ? err.name : err}`);
      if (iosVoiceContext() === "standalone" || iosVoiceContext() === "other-browser") setProblem("open-in-safari");
      finish();
      return true;
    }
    return true;
  }, [stopBackground, endCapture]);

  // Check (and quietly install) the on-device model for the current language.
  useEffect(() => {
    const Ctor = getRecognitionCtor();
    if (Ctor) void checkOnDevice(Ctor, SPEECH_LANG[lang]);
  }, [lang]);

  // "Yes?" is spoken (paused) right after the wake word: the 8 s start once the band has finished talking.
  useEffect(() => {
    if (!paused && captureUntil.current != null) armCaptureTimer();
  }, [paused, armCaptureTimer]);

  // Background: follow enabled / paused / talking / language. Starts on its own where allowed.
  useEffect(() => {
    want.current = { enabled, paused, lang };
    if (!enabled || paused || talking) {
      stopBackground();
      return;
    }
    if (bg.current && bg.current.lang !== SPEECH_LANG[lang]) stopBackground(); // language changed
    startBackground(false);
  }, [enabled, paused, talking, lang, startBackground, stopBackground]);

  // Unmount: stop everything.
  useEffect(
    () => () => {
      const r = bg.current;
      if (r) r.onend = null;
      stopBackground();
      if (captureTimer.current) clearTimeout(captureTimer.current);
      const t = talkRec.current;
      if (t) {
        t.onresult = t.onerror = t.onend = null;
        try {
          t.abort();
        } catch {
          // already stopped
        }
      }
    },
    [stopBackground],
  );

  return { listening, talking, capturing, needsTap, problem, arm, talk };
}
