"use client";

import { useEffect, useRef } from "react";
import type { Alert } from "@/lib/types";
import { ESCALATION_MS } from "./util";

/**
 * When an OPEN alert's escalation ring hits 0, ask the server to escalate it (once per alert per tab).
 * The server is idempotent, so several open dashboards are safe.
 */
export function useEscalation(alerts: Alert[], now: number | null, onEscalated: () => void) {
  const requested = useRef(new Set<string>());

  useEffect(() => {
    if (now == null) return;
    for (const a of alerts) {
      if (a.status !== "open" || a.escalatedTo || requested.current.has(a.id)) continue;
      if (now - a.createdAt < ESCALATION_MS) continue;

      requested.current.add(a.id);
      fetch("/api/escalate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ alertId: a.id }),
      })
        .then((res) => (res.ok ? res.json() : null))
        .then((data: { escalated?: boolean; alert?: Alert } | null) => {
          // Not due yet on the server clock (small skew) or a transient error → allow a retry.
          const stillPending = !data || (!data.escalated && data.alert?.status === "open" && !data.alert.escalatedTo);
          if (stillPending) setTimeout(() => requested.current.delete(a.id), 1000);
          onEscalated();
        })
        .catch(() => setTimeout(() => requested.current.delete(a.id), 1000));
    }
  }, [alerts, now, onEscalated]);
}
