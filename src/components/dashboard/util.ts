"use client";

import { useEffect, useState } from "react";
import type { Alert, AlertPriority, AlertType, Nurse } from "@/lib/types";

// IEC 60601-1-8 style: P1 red fast flash · P2 yellow slow flash · P3 light blue steady · OK green.
// Red/yellow are reserved for alarms — don't use them for anything else on the dashboard.
export const PRIORITY: Record<
  AlertPriority,
  { label: string; text: string; bg: string; border: string; stroke: string; flash: string }
> = {
  1: { label: "P1", text: "text-red-400", bg: "bg-red-500", border: "border-red-500", stroke: "#ef4444", flash: "kijo-flash-fast" },
  2: { label: "P2", text: "text-yellow-300", bg: "bg-yellow-400", border: "border-yellow-400", stroke: "#facc15", flash: "kijo-flash-slow" },
  3: { label: "P3", text: "text-sky-300", bg: "bg-sky-300", border: "border-sky-300", stroke: "#7dd3fc", flash: "" },
};
export const OK_STROKE = "#34d399";

export const ALERT_LABEL: Record<AlertType, string> = {
  fall: "Fall",
  voice: "Voice call",
  sos_shake: "SOS shake",
  need_pain: "Pain",
  need_bathroom: "Bathroom",
  need_water: "Water",
  need_help: "Help",
  vitals: "Vitals",
};

export const ALERT_ICON: Record<AlertType, string> = {
  fall: "⬇️",
  voice: "🎙️",
  sos_shake: "📳",
  need_pain: "😣",
  need_bathroom: "🚻",
  need_water: "💧",
  need_help: "🙋",
  vitals: "♥",
};

export const ESCALATION_MS = 90_000;

/** Highest-priority, then oldest, first. */
export function sortAlerts(alerts: Alert[]): Alert[] {
  return [...alerts].sort((a, b) => a.priority - b.priority || a.createdAt - b.createdAt);
}

export function topAlertFor(alerts: Alert[], residentId: string): Alert | undefined {
  return sortAlerts(alerts.filter((a) => a.residentId === residentId))[0];
}

/** Ticking clock (ms). Null until mounted so nothing time-based renders during prerender. */
export function useNow(intervalMs = 500): number | null {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const t = setInterval(tick, intervalMs);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, [intervalMs]);
  return now;
}

export function formatDuration(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

export function initials(name: string): string {
  const parts = name.replace(/^(Mr|Mrs|Ms|Mme|M|Sr|Sra|Nurse)\.?\s+/i, "").split(/\s+/);
  return parts.map((p) => p[0]).join("").slice(0, 2).toUpperCase();
}

export function nurseShort(nurse: Nurse | undefined): string {
  return nurse ? nurse.name.replace(/^Nurse\s+/, "") : "—";
}

export function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return `(•••) •••-••${digits.slice(-2)}`;
}

export const LANGUAGE_NAME = { en: "English", fr: "French", es: "Spanish" } as const;

export async function patchAlert(id: string, body: { action: string; nurseId?: string }) {
  const res = await fetch(`/api/alerts/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error ?? `HTTP ${res.status}`);
  }
}
