"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Alert, AlertPriority } from "@/lib/types";

// Three distinct Web Audio tones (no audio files):
//   P1 urgent — 3 + 2 burst of high square beeps (IEC 60601-1-8 high-priority rhythm)
//   P2 double — two descending triangle tones
//   P3 chime  — one soft sine chime with a long decay
// Sounds play only for alerts that appear after the dashboard loaded.

function beep(
  ctx: AudioContext,
  at: number,
  freq: number,
  dur: number,
  type: OscillatorType,
  peak: number,
  release = 0.03,
) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, at);
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(peak, at + 0.01);
  gain.gain.setValueAtTime(peak, at + Math.max(0.01, dur - release));
  gain.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  osc.connect(gain).connect(ctx.destination);
  osc.start(at);
  osc.stop(at + dur + 0.02);
}

export function playPriority(ctx: AudioContext, priority: AlertPriority) {
  const t = ctx.currentTime + 0.02;
  if (priority === 1) {
    [0, 0.16, 0.32, 0.72, 0.88].forEach((o) => beep(ctx, t + o, 988, 0.11, "square", 0.08));
  } else if (priority === 2) {
    beep(ctx, t, 660, 0.22, "triangle", 0.22, 0.08);
    beep(ctx, t + 0.3, 494, 0.3, "triangle", 0.22, 0.12);
  } else {
    beep(ctx, t, 880, 1.2, "sine", 0.12, 1.0);
    beep(ctx, t, 1320, 0.8, "sine", 0.04, 0.7);
  }
}

export function useAlarmSounds(alerts: Alert[] | undefined) {
  const ctxRef = useRef<AudioContext | null>(null);
  const seen = useRef<Set<string> | null>(null);
  const unlockedThisGesture = useRef(false); // so the click that enables sound doesn't also mute it
  const [muted, setMuted] = useState(false);
  const [ready, setReady] = useState(false); // browsers need a user gesture before audio can play

  // Unlock audio on the first click / key press anywhere.
  useEffect(() => {
    const unlock = () => {
      if (!ctxRef.current) ctxRef.current = new AudioContext();
      unlockedThisGesture.current = ctxRef.current.state !== "running";
      void ctxRef.current.resume().then(() => setReady(ctxRef.current?.state === "running"));
    };
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);

  useEffect(() => {
    if (!alerts) return;
    if (!seen.current) {
      seen.current = new Set(alerts.map((a) => a.id)); // first load: existing alerts stay silent
      return;
    }
    const fresh = alerts.filter((a) => !seen.current!.has(a.id));
    fresh.forEach((a) => seen.current!.add(a.id));
    if (fresh.length === 0 || muted) return;
    const ctx = ctxRef.current;
    if (!ctx || ctx.state !== "running") return;
    const top = Math.min(...fresh.map((a) => a.priority)) as AlertPriority;
    playPriority(ctx, top);
  }, [alerts, muted]);

  const toggleMute = useCallback(() => {
    if (unlockedThisGesture.current) {
      unlockedThisGesture.current = false;
      return;
    }
    setMuted((m) => !m);
  }, []);
  return { muted, ready, toggleMute };
}
