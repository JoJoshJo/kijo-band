"use client";

import { useEffect, useRef } from "react";
import type { Alert, Resident } from "@/lib/types";
import { isTypingTarget } from "./views";

// Hidden presenter shortcuts (dashboard only):
//   1 = random P3 (water / bathroom) · 2 = random P2 (pain) · 3 = random P1 fall
// They go through POST /api/alert — the same route the band uses — so they behave like real band alerts
// (rate limit, resident status, ntfy push). Picks a non-guest resident with no active alert.

type Shortcut = { type: "need_water" | "need_bathroom" | "need_pain" | "fall"; source?: "detector" };
const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(Math.random() * xs.length)];

const SHORTCUTS: Record<string, () => Shortcut> = {
  "1": () => ({ type: pick(["need_water", "need_bathroom"] as const) }),
  "2": () => ({ type: "need_pain" }),
  "3": () => ({ type: "fall", source: "detector" }),
};

export function useDemoShortcuts(residents: Resident[], alerts: Alert[]) {
  const latest = useRef({ residents, alerts });
  useEffect(() => {
    latest.current = { residents, alerts };
  }, [residents, alerts]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const make = SHORTCUTS[e.key];
      if (!make || e.repeat || e.metaKey || e.ctrlKey || e.altKey || isTypingTarget(e.target)) return;
      const { residents, alerts } = latest.current;
      const busy = new Set(alerts.map((a) => a.residentId));
      const candidates = residents.filter((r) => !r.isGuest && !busy.has(r.id));
      if (candidates.length === 0) return;
      const r = pick(candidates);
      const s = make();
      fetch("/api/alert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          residentId: r.id,
          type: s.type,
          ...(s.source ? { source: s.source } : {}),
          ...(s.type === "fall" ? { heartRate: r.heartRate } : {}),
        }),
      })
        .then(async (res) => {
          if (!res.ok) console.warn("Demo shortcut failed:", res.status, await res.text());
        })
        .catch((err) => console.warn("Demo shortcut failed:", err));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}
