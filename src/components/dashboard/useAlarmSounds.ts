"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Alert, AlertPriority } from "@/lib/types";
import { useSessionValue } from "./useSessionValue";

// Web Audio tones (no audio files):
//   P1 urgent — 3 + 2 burst of high square beeps (IEC 60601-1-8 high-priority rhythm), REPEATS every
//               3 s while any P1 in scope is unacknowledged; stops the moment none is left.
//   P2 double — two descending triangle tones, once per new alert
//   P3 chime  — one soft sine chime with a long decay, once per new alert
//   Team tone — one soft two-note sine, once, for another nurse's new P1 (Nurse view strip)
// P2/P3/team sounds play only for alerts that appear after the view loaded.

export const P1_REPEAT_MS = 3000;

function beep(
  ctx: AudioContext,
  out: AudioNode,
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
  osc.connect(gain).connect(out);
  osc.start(at);
  osc.stop(at + dur + 0.02);
}

/** Plays one pattern through its own gain node; disconnecting that node silences it at once. */
export function playPriority(ctx: AudioContext, priority: AlertPriority): GainNode {
  const out = ctx.createGain();
  out.connect(ctx.destination);
  const t = ctx.currentTime + 0.02;
  if (priority === 1) {
    [0, 0.16, 0.32, 0.72, 0.88].forEach((o) => beep(ctx, out, t + o, 988, 0.11, "square", 0.08));
  } else if (priority === 2) {
    beep(ctx, out, t, 660, 0.22, "triangle", 0.22, 0.08);
    beep(ctx, out, t + 0.3, 494, 0.3, "triangle", 0.22, 0.12);
  } else {
    beep(ctx, out, t, 880, 1.2, "sine", 0.12, 1.0);
    beep(ctx, out, t, 1320, 0.8, "sine", 0.04, 0.7);
  }
  return out;
}

function playTeamTone(ctx: AudioContext) {
  const t = ctx.currentTime + 0.02;
  beep(ctx, ctx.destination, t, 784, 0.35, "sine", 0.06, 0.25);
  beep(ctx, ctx.destination, t + 0.4, 659, 0.5, "sine", 0.06, 0.4);
}

const isCritical = (a: Alert) => a.priority === 1 && a.status === "open";

/**
 * Alarm sounds for one view.
 * - `alerts`: the alerts this screen is responsible for. Open P1s here ring continuously until acknowledged.
 * - `teamAlerts`: other nurses' alerts (Nurse view). A new open P1 there plays a single soft tone.
 * Mute silences everything; `critical` stays available so the header can warn while muted.
 */
export function useAlarmSounds(alerts: Alert[] | undefined, teamAlerts?: Alert[]) {
  const ctxRef = useRef<AudioContext | null>(null);
  const seen = useRef<Set<string> | null>(null);
  const teamSeen = useRef<Set<string> | null>(null);
  const burst = useRef<GainNode | null>(null);
  const lastBurstAt = useRef(0);
  const unlockedThisGesture = useRef(false); // so the click that enables sound doesn't also mute it
  const [mutedRaw, setMutedRaw] = useSessionValue("kijo-muted", "0"); // survives view switches
  const muted = mutedRaw === "1";
  const [ready, setReady] = useState(false); // browsers need a user gesture before audio can play

  // Unlock audio on the first click / key press anywhere.
  useEffect(() => {
    const unlock = () => {
      if (!ctxRef.current) ctxRef.current = new AudioContext();
      unlockedThisGesture.current = ctxRef.current.state !== "running";
      void ctxRef.current.resume().then(() => setReady(ctxRef.current?.state === "running"));
    };
    // Coming back from another view: the tab already had a user gesture, so audio can start right away.
    const nav = navigator as Navigator & { userActivation?: { hasBeenActive: boolean } };
    if (nav.userActivation?.hasBeenActive) {
      ctxRef.current = new AudioContext();
      void ctxRef.current.resume().then(() => setReady(ctxRef.current?.state === "running"));
    }
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
      void ctxRef.current?.close(); // browsers cap live AudioContexts; free it when leaving the view
      ctxRef.current = null;
    };
  }, []);

  // Continuous P1 alarm. Key = the set of unacknowledged P1 ids, so acknowledging one re-evaluates at once.
  const criticalIds = (alerts ?? []).filter(isCritical).map((a) => a.id).sort();
  const critical = criticalIds.length;
  const criticalKey = criticalIds.join(",");
  useEffect(() => {
    const stopBurst = () => {
      burst.current?.disconnect(); // cuts a burst that is still sounding
      burst.current = null;
    };
    if (!criticalKey || muted || !ready) {
      stopBurst();
      return;
    }
    const ring = () => {
      const ctx = ctxRef.current;
      if (!ctx || ctx.state !== "running") return;
      stopBurst();
      burst.current = playPriority(ctx, 1);
      lastBurstAt.current = Date.now();
    };
    // Keep the 3 s rhythm when the set changes (e.g. a second P1 arrives) instead of double-firing.
    const wait = Math.max(0, P1_REPEAT_MS - (Date.now() - lastBurstAt.current));
    let interval: ReturnType<typeof setInterval> | undefined;
    const first = setTimeout(() => {
      ring();
      interval = setInterval(ring, P1_REPEAT_MS);
    }, wait);
    return () => {
      clearTimeout(first);
      if (interval) clearInterval(interval);
      stopBurst();
    };
  }, [criticalKey, muted, ready]);

  // P2 / P3: ring once when a new one appears (P1s are handled by the loop above).
  useEffect(() => {
    if (!alerts) return;
    if (!seen.current) {
      seen.current = new Set(alerts.map((a) => a.id)); // first load: existing P2/P3 stay silent
      return;
    }
    const fresh = alerts.filter((a) => !seen.current!.has(a.id));
    fresh.forEach((a) => seen.current!.add(a.id));
    const once = fresh.filter((a) => a.priority !== 1);
    if (once.length === 0 || muted) return;
    const ctx = ctxRef.current;
    if (!ctx || ctx.state !== "running") return;
    playPriority(ctx, Math.min(...once.map((a) => a.priority)) as AlertPriority);
  }, [alerts, muted]);

  // Team emergencies: one soft tone per new open P1 of another nurse.
  useEffect(() => {
    if (!teamAlerts) return;
    const p1 = teamAlerts.filter(isCritical);
    if (!teamSeen.current) {
      teamSeen.current = new Set(p1.map((a) => a.id));
      return;
    }
    const fresh = p1.filter((a) => !teamSeen.current!.has(a.id));
    fresh.forEach((a) => teamSeen.current!.add(a.id));
    if (fresh.length === 0 || muted) return;
    const ctx = ctxRef.current;
    if (ctx && ctx.state === "running") playTeamTone(ctx);
  }, [teamAlerts, muted]);

  const toggleMute = useCallback(() => {
    if (unlockedThisGesture.current) {
      unlockedThisGesture.current = false;
      return;
    }
    setMutedRaw(muted ? "0" : "1");
  }, [muted, setMutedRaw]);
  return { muted, ready, toggleMute, critical };
}
