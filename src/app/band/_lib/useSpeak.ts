"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Language } from "@/lib/types";
import { SPEECH_LANG } from "./speechLang";

const RATE = 0.9; // a little slower than default: easier to follow for older residents
const RESUME_DELAY_MS = 600; // keep the mic paused a moment after speaking so it doesn't catch the tail

function pickVoice(tag: string): SpeechSynthesisVoice | undefined {
  const voices = window.speechSynthesis.getVoices();
  const base = tag.slice(0, 2).toLowerCase();
  return (
    voices.find((v) => v.lang === tag && v.localService) ??
    voices.find((v) => v.lang === tag) ??
    voices.find((v) => v.lang.toLowerCase().startsWith(base))
  );
}

/**
 * Speak short sentences in the resident's language (speechSynthesis, on the device; nothing is sent).
 * `speaking` stays true until shortly after the utterance ends, so voice listening can pause meanwhile.
 * Browsers without speechSynthesis: speak() does nothing.
 */
export function useSpeak(lang: Language): { speak: (text: string) => void; stop: () => void; speaking: boolean } {
  const [speaking, setSpeaking] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const clearTimers = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  };

  const stop = useCallback(() => {
    clearTimers();
    if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
    setSpeaking(false);
  }, []);

  const speak = useCallback(
    (text: string) => {
      if (typeof window === "undefined" || !("speechSynthesis" in window) || !text) return;
      const synth = window.speechSynthesis;
      clearTimers();
      synth.cancel(); // newest message wins
      const tag = SPEECH_LANG[lang];
      const u = new SpeechSynthesisUtterance(text);
      u.lang = tag;
      u.rate = RATE;
      const voice = pickVoice(tag);
      if (voice) u.voice = voice;
      let ended = false;
      const done = () => {
        if (ended) return;
        ended = true;
        clearTimers();
        timers.current.push(setTimeout(() => setSpeaking(false), RESUME_DELAY_MS));
      };
      u.onend = done;
      u.onerror = done;
      setSpeaking(true);
      // Some engines (older Safari) never fire `end`: give up after a generous estimate.
      timers.current.push(setTimeout(done, 2000 + text.length * 120));
      synth.speak(u);
    },
    [lang],
  );

  useEffect(() => {
    // Voices load asynchronously in Chrome; touching the list early makes pickVoice find them later.
    if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.getVoices();
    return () => {
      clearTimers();
      if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
    };
  }, []);

  return { speak, stop, speaking };
}

/** Short buzz when an alert has been sent (Android Chrome; iOS Safari has no vibrate → no-op). */
export function vibrateSent() {
  try {
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") navigator.vibrate([120, 80, 120]);
  } catch {
    // Not allowed (no user activation yet, or blocked in an iframe): silent.
  }
}

let audioCtx: AudioContext | null = null;
/** Soft two-note chime ("I heard you"). Best effort: silent if audio isn't allowed yet. */
export function chime() {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    audioCtx ??= new Ctx();
    const ctx = audioCtx;
    if (ctx.state === "suspended") void ctx.resume();
    const t0 = ctx.currentTime + 0.02;
    [660, 880].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      const start = t0 + i * 0.16;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.18, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.28);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.3);
    });
  } catch {
    // no audio: the spoken "Yes?" still follows
  }
}
