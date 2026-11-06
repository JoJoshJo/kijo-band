"use client";

import { useCallback, useEffect, useState } from "react";
import type { Resident } from "@/lib/types";

// DISPLAY ONLY — never written to the DB.
// Residents whose stored HR hasn't changed in the last 10s (no band sending updates) get a gentle
// random walk of ±3 bpm around their stored value so the floor feels alive. Live band values win.

const STALE_AFTER_MS = 10_000;
const MAX_DRIFT = 3;
const TICK_MS = 2_000;

type DriftState = {
  seen: Record<string, { hr: number; changedAt: number }>; // changedAt = client ms (0 = never seen change)
  offsets: Record<string, number>;
};

export function useHeartRateDrift() {
  const [state, setState] = useState<DriftState>({ seen: {}, offsets: {} });

  /** Call with every fresh /api/state payload to detect band HR updates. */
  const track = useCallback((residents: Resident[]) => {
    const t = Date.now();
    setState((prev) => {
      let changed = false;
      const seen = { ...prev.seen };
      for (const r of residents) {
        const p = prev.seen[r.id];
        if (!p || p.hr !== r.heartRate) {
          seen[r.id] = { hr: r.heartRate, changedAt: p ? t : 0 };
          changed = true;
        }
      }
      return changed ? { ...prev, seen } : prev;
    });
  }, []);

  useEffect(() => {
    const iv = setInterval(() => {
      setState((prev) => {
        const offsets: Record<string, number> = {};
        for (const id of Object.keys(prev.seen)) {
          const cur = prev.offsets[id] ?? 0;
          // ~60% chance to step each tick so tiles don't all change in lockstep.
          const step = Math.random() < 0.6 ? (Math.random() < 0.5 ? -1 : 1) : 0;
          offsets[id] = Math.max(-MAX_DRIFT, Math.min(MAX_DRIFT, cur + step));
        }
        return { ...prev, offsets };
      });
    }, TICK_MS);
    return () => clearInterval(iv);
  }, []);

  const displayHr = useCallback(
    (r: Resident, clientNow: number | null): number => {
      const s = state.seen[r.id];
      const live = s && clientNow != null && s.changedAt > 0 && clientNow - s.changedAt < STALE_AFTER_MS;
      return live ? r.heartRate : r.heartRate + (state.offsets[r.id] ?? 0);
    },
    [state],
  );

  return { track, displayHr };
}
