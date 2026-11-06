"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Alert } from "@/lib/types";
import { isTypingTarget } from "./views";

// Hidden demo backup (Charge view only): Shift+A plays the pitch scenario through the real APIs,
// Esc stops it. The P1 escalates on its own after 90 s (useEscalation), then autopilot ends.
// No cleanup on purpose — the demo Reset clears everything.

type Step = { at: number; label: string; url: "/api/alert" | "/api/triage"; body: Record<string, unknown> };

const STEPS: Step[] = [
  { at: 0, label: "P3 water · Room 3", url: "/api/alert", body: { residentId: "r-03", type: "need_water" } },
  {
    at: 8_000,
    label: "P2 voice (FR) · Room 2",
    url: "/api/triage",
    body: { residentId: "r-02", transcript: "j'ai mal au dos", language: "fr" },
  },
  {
    at: 16_000,
    label: "P1 fall · Room 14",
    url: "/api/alert",
    body: { residentId: "r-14", type: "fall", source: "detector", heartRate: 104 },
  },
];
const MAX_RUN_MS = 16_000 + 90_000 + 30_000; // safety stop if the escalation never shows up

export function useAutopilot(alerts: Alert[]) {
  const [status, setStatus] = useState<string | null>(null); // null = not running
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const p1Id = useRef<string | null>(null);
  const alertsRef = useRef(alerts);
  useEffect(() => {
    alertsRef.current = alerts;
  }, [alerts]);

  const stop = useCallback(() => {
    for (const t of timers.current) clearTimeout(t);
    timers.current = [];
    p1Id.current = null;
    setStatus(null);
  }, []);

  const start = useCallback(() => {
    stop();
    setStatus("Starting…");
    const later = (ms: number, fn: () => void) => timers.current.push(setTimeout(fn, ms));
    for (const step of STEPS) {
      later(step.at, async () => {
        setStatus(step.label);
        try {
          const res = await fetch(step.url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(step.body),
          });
          const json = (await res.json().catch(() => ({}))) as { alert?: Alert };
          if (!res.ok) console.warn("Autopilot step failed:", step.label, res.status, json);
          if (step.body.type === "fall" && json.alert) {
            p1Id.current = json.alert.id;
            setStatus("Waiting for escalation (90 s)");
          }
        } catch (err) {
          console.warn("Autopilot step failed:", step.label, err);
        }
      });
    }
    // Ends once the P1 has escalated to the charge nurse (checked from a timer, not an effect).
    const watch = setInterval(() => {
      const id = p1Id.current;
      if (id && alertsRef.current.some((a) => a.id === id && a.escalatedTo)) {
        clearInterval(watch);
        setStatus("Escalated — done");
        later(3_000, stop);
      }
    }, 1_000);
    timers.current.push(watch as unknown as ReturnType<typeof setTimeout>);
    later(MAX_RUN_MS, stop);
  }, [stop]);

  const running = status !== null;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "Escape" && running) stop();
      else if (e.shiftKey && (e.key === "A" || e.key === "a") && !e.repeat && !running) start();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [running, start, stop]);

  // Unmount (leaving the Charge view) stops pending steps.
  useEffect(() => stop, [stop]);

  return { status };
}

/** Small floating pill while autopilot runs. */
export function AutopilotPill({ status }: { status: string | null }) {
  if (!status) return null;
  return (
    <div
      role="status"
      className="fixed bottom-16 left-1/2 z-40 flex -translate-x-1/2 items-center gap-2 rounded-full border border-teal-500/60 bg-slate-900/95 px-4 py-1.5 text-sm text-slate-200 shadow-lg"
    >
      <span className="h-2 w-2 animate-pulse rounded-full bg-teal-400" aria-hidden />
      <span className="font-semibold text-teal-300">Autopilot</span>
      <span className="text-slate-400">· {status} · Esc to stop</span>
    </div>
  );
}
