"use client";

import { useEffect, useRef, useState } from "react";
import type { Language } from "@/lib/types";
import { VoiceEngine, type IosContext, type RecognitionCtor, type VoiceProblem, type VoiceSnapshot } from "./voiceEngine";

export type { VoiceProblem, VoiceSnapshot };

function getRecognition(): { Ctor: RecognitionCtor | null; name: string } {
  if (typeof window === "undefined") return { Ctor: null, name: "none" };
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  if (w.SpeechRecognition) return { Ctor: w.SpeechRecognition, name: "SpeechRecognition" };
  if (w.webkitSpeechRecognition) return { Ctor: w.webkitSpeechRecognition, name: "webkitSpeechRecognition" };
  return { Ctor: null, name: "none" };
}

/**
 * iOS speech recognition only really works in Safari itself: the home-screen app (standalone) and other
 * iOS browsers (Chrome, Firefox, Edge — WKWebView) expose webkitSpeechRecognition, but it never starts or
 * fails with service-not-allowed. Returns null when not on iOS.
 */
export function iosVoiceContext(): IosContext {
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

const INITIAL: VoiceSnapshot = {
  state: "idle",
  mode: "background",
  needsTap: false,
  problem: null,
  engine: "",
  lang: "",
  lastInterim: "",
  lastFinal: "",
  decision: "",
  restarts: 0,
  lastError: "",
};

/**
 * React wrapper around the band's single recognizer (VoiceEngine — see voiceEngine.ts for the state
 * machine and rules). `arm()` and `talk()` must be called inside the tap: iOS only starts recognition
 * synchronously inside a user gesture.
 */
export function useVoiceTrigger({
  enabled,
  paused = false,
  lang,
  debug = false,
  onTrigger,
  onTalk,
  onWake,
}: {
  enabled: boolean;
  /** While the band is speaking: what is heard is dropped (the recognizer keeps running). */
  paused?: boolean;
  lang: Language;
  /** ?debug=1: keep the last transcripts in the snapshot (on screen only). */
  debug?: boolean;
  onTrigger: (sentence: string) => void;
  onTalk?: (sentence: string) => void;
  onWake?: () => void;
}) {
  const cb = useRef({ onTrigger, onTalk, onWake });
  useEffect(() => {
    cb.current = { onTrigger, onTalk, onWake };
  }, [onTrigger, onTalk, onWake]);

  const [snap, setSnap] = useState<VoiceSnapshot>(INITIAL);
  const engineRef = useRef<VoiceEngine | null>(null);

  // One engine for the band's lifetime (created on the client only). The effects below run after this
  // one on mount, so they hand it the initial language / mute / enabled too.
  useEffect(() => {
    const { Ctor, name } = getRecognition();
    const engine = new VoiceEngine(
      Ctor,
      {
        onTrigger: (t) => cb.current.onTrigger(t),
        onTalk: (t) => (cb.current.onTalk ?? cb.current.onTrigger)(t),
        onWake: () => cb.current.onWake?.(),
        onChange: setSnap,
      },
      { ios: iosVoiceContext, engineName: name },
    );
    engineRef.current = engine;
    engine.publish();
    return () => {
      engine.destroy();
      engineRef.current = null;
    };
  }, []);
  useEffect(() => engineRef.current?.setDebug(debug), [debug]);
  useEffect(() => engineRef.current?.setLang(lang), [lang]);
  useEffect(() => engineRef.current?.setMuted(paused), [paused]);
  useEffect(() => engineRef.current?.setEnabled(enabled), [enabled]);

  return {
    listening: snap.state === "listening",
    talking: snap.mode === "talk",
    capturing: snap.mode === "capture",
    needsTap: snap.needsTap,
    problem: snap.problem,
    snapshot: snap,
    /** Start / resume listening now (inside a tap). Optional new language (language change tap). */
    arm: (l?: Language) => engineRef.current?.arm(l),
    /** Tap and talk (inside the tap). False if this browser has no speech recognition. */
    talk: () => engineRef.current?.talk() ?? false,
  };
}
