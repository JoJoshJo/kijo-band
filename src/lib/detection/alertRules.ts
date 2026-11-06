// Rule-based alert classification for non-voice alerts (spec section 4 + 6).
// Shared by the band (client) and /api/alert (server). The server is the source of truth for priority.
import type { AlertPriority, AlertType } from "@/lib/types";
import { INACTIVITY_MS } from "./activity";

/** Alert types the band can create directly. `voice` goes through /api/triage instead. */
export const BAND_ALERT_TYPES = [
  "fall",
  "sos_shake",
  "need_pain",
  "need_bathroom",
  "need_water",
  "need_help",
  "vitals",
  "inactivity",
  "up_at_night",
] as const satisfies readonly AlertType[];
export type BandAlertType = (typeof BAND_ALERT_TYPES)[number];

/**
 * `big_help` = the giant red HELP button (need_help, P1).
 * `need_button` = the smaller 🙋 Help need button (need_help, P2).
 */
export const ALERT_SOURCES = ["big_help", "need_button", "detector", "simulated"] as const;
export type AlertSource = (typeof ALERT_SOURCES)[number];

export const ALERT_RATE_LIMIT_MS = 10_000;

/** Heart-rate alarm thresholds: outside this band for VITALS_SUSTAIN_MS → vitals alert. */
export const HR_HIGH = 130;
export const HR_LOW = 45;
export const VITALS_SUSTAIN_MS = 10_000;

export function priorityFor(type: BandAlertType, source: AlertSource | undefined): AlertPriority {
  switch (type) {
    case "fall":
    case "sos_shake":
    case "vitals":
      return 1;
    case "need_help":
      return source === "big_help" ? 1 : 2;
    case "need_pain":
    case "inactivity":
      return 2;
    case "need_bathroom":
    case "need_water":
    case "up_at_night":
      return 3;
  }
}

export function summaryFor(
  type: BandAlertType,
  source: AlertSource | undefined,
  heartRate: number | undefined,
): string {
  const hr = heartRate != null ? ` · HR ${heartRate}` : "";
  const sim = source === "simulated" ? " (simulated)" : "";
  switch (type) {
    case "fall":
      return `Probable fall, no movement after impact${sim}${hr}`;
    case "sos_shake":
      return `SOS shake from band${sim}${hr}`;
    case "vitals": {
      const dir = heartRate != null && heartRate < HR_LOW ? "low" : "high";
      return `Heart rate ${dir}, sustained 10s${sim}${hr}`;
    }
    case "need_help":
      return source === "big_help" ? `HELP button pressed${hr}` : `Asks for help${hr}`;
    case "need_pain":
      return `Reports pain${hr}`;
    case "need_bathroom":
      return "Needs bathroom assistance";
    case "need_water":
      return "Asks for water";
    case "inactivity":
      return `No movement for ${Math.round(INACTIVITY_MS / 60_000)} min${sim}`;
    case "up_at_night":
      return `Resident is up — check before a fall${sim}`;
  }
}

/** Appended to a P1 alert's summary when the resident taps "I'm OK – cancel" (P1s are never auto-resolved). */
export const RESIDENT_OK_SUFFIX = " · Resident says OK";
export function residentSaysOk(summary: string): boolean {
  return summary.endsWith(RESIDENT_OK_SUFFIX);
}
