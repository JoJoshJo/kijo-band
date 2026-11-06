// Shift handoff: pure aggregation + rule-based handoff (also the fallback when Claude is unavailable).
// No I/O here so it is unit-tested (facts.test.ts).

import type { AlertPriority, AlertType } from "@/lib/types";
import { residentSaysOk } from "@/lib/detection/alertRules";

/** One alert row joined with its resident and assigned nurse (fictional demo data). */
export type HandoffAlertRow = {
  residentId: string;
  room: string;
  name: string;
  fallRisk: string;
  nurseId: string;
  type: AlertType;
  priority: AlertPriority;
  status: "open" | "acknowledged" | "resolved";
  createdAt: number;
  acknowledgedAt: number | null;
  resolvedAt: number | null;
  escalatedTo: string | null;
  summary: string;
};

export type HandoffNurse = { id: string; name: string; role: string };

export type ResidentFacts = {
  residentId: string;
  room: string;
  name: string;
  fallRisk: string;
  nurseId: string;
  total: number;
  p1: number;
  falls: number;
  byType: Partial<Record<AlertType, number>>;
  residentSaysOk: number;
  inactivity: number;
  upAtNight: number;
  open: number;
  escalated: number;
};

export type NurseFacts = {
  nurseId: string;
  name: string;
  role: string;
  alerts: number; // assigned to this nurse (charge nurse: escalated to her)
  handled: number; // acknowledged or resolved
  avgResponseMs: number | null; // created → acknowledged
  open: { room: string; name: string; type: AlertType; priority: AlertPriority }[];
};

export type ShiftFacts = {
  totals: { alerts: number; p1: number; p2: number; p3: number; open: number; escalations: number };
  residents: ResidentFacts[]; // only residents with at least one alert
  nurses: NurseFacts[];
};

export type AttentionItem = { room: string; name: string; reason: string };

export type Handoff = {
  source: "claude" | "rules";
  generatedAt: number;
  totals: ShiftFacts["totals"];
  needsAttention: AttentionItem[];
  nurses: (NurseFacts & { note: string })[];
  recommendations: string[];
  text: string; // plain-text version for the Copy button
};

export const TYPE_LABEL: Record<AlertType, string> = {
  fall: "fall",
  voice: "voice call",
  sos_shake: "SOS shake",
  need_pain: "pain",
  need_bathroom: "bathroom",
  need_water: "water",
  need_help: "help",
  vitals: "vitals",
  inactivity: "no movement",
  up_at_night: "up at night",
};

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

export function buildFacts(rows: HandoffAlertRow[], nurses: HandoffNurse[]): ShiftFacts {
  const residents = new Map<string, ResidentFacts>();
  for (const a of rows) {
    let r = residents.get(a.residentId);
    if (!r) {
      r = {
        residentId: a.residentId,
        room: a.room,
        name: a.name,
        fallRisk: a.fallRisk,
        nurseId: a.nurseId,
        total: 0,
        p1: 0,
        falls: 0,
        byType: {},
        residentSaysOk: 0,
        inactivity: 0,
        upAtNight: 0,
        open: 0,
        escalated: 0,
      };
      residents.set(a.residentId, r);
    }
    r.total += 1;
    if (a.priority === 1) r.p1 += 1;
    if (a.type === "fall") r.falls += 1;
    if (a.type === "inactivity") r.inactivity += 1;
    if (a.type === "up_at_night") r.upAtNight += 1;
    r.byType[a.type] = (r.byType[a.type] ?? 0) + 1;
    if (residentSaysOk(a.summary)) r.residentSaysOk += 1;
    if (a.status !== "resolved") r.open += 1;
    if (a.escalatedTo) r.escalated += 1;
  }

  const nurseFacts: NurseFacts[] = [];
  for (const n of nurses) {
    const isCharge = n.role === "Charge";
    const mine = rows.filter((a) => (isCharge ? a.escalatedTo === n.id : a.nurseId === n.id));
    if (isCharge && mine.length === 0) continue; // charge nurse only appears if something escalated
    const acked = mine.filter((a) => a.acknowledgedAt != null);
    nurseFacts.push({
      nurseId: n.id,
      name: n.name,
      role: n.role,
      alerts: mine.length,
      handled: mine.filter((a) => a.acknowledgedAt != null || a.status === "resolved").length,
      avgResponseMs: acked.length
        ? Math.round(acked.reduce((s, a) => s + ((a.acknowledgedAt as number) - a.createdAt), 0) / acked.length)
        : null,
      open: mine
        .filter((a) => a.status !== "resolved")
        .map((a) => ({ room: a.room, name: a.name, type: a.type, priority: a.priority })),
    });
  }

  return {
    totals: {
      alerts: rows.length,
      p1: rows.filter((a) => a.priority === 1).length,
      p2: rows.filter((a) => a.priority === 2).length,
      p3: rows.filter((a) => a.priority === 3).length,
      open: rows.filter((a) => a.status !== "resolved").length,
      escalations: rows.filter((a) => a.escalatedTo).length,
    },
    residents: [...residents.values()],
    nurses: nurseFacts,
  };
}

function attentionScore(r: ResidentFacts): number {
  return r.falls * 10 + r.p1 * 8 + r.residentSaysOk * 6 + r.open * 5 + r.inactivity * 4 + r.upAtNight * 3 + r.total;
}

function needsAttention(r: ResidentFacts): boolean {
  return r.p1 > 0 || r.falls > 0 || r.residentSaysOk > 0 || r.inactivity > 0 || r.upAtNight > 0 || r.open > 0 || r.total >= 2;
}

export function ruleReason(r: ResidentFacts): string {
  const parts: string[] = [];
  if (r.falls) parts.push(plural(r.falls, "fall"));
  const otherP1 = r.p1 - r.falls;
  if (otherP1 > 0) parts.push(plural(otherP1, r.falls ? "other P1 alert" : "P1 alert"));
  if (r.residentSaysOk) parts.push(`said "I'm OK" after a P1 — still check`);
  if (r.inactivity) parts.push("no movement detected");
  if (r.upAtNight) parts.push(`up at night ${r.upAtNight}×`);
  const repeated = (Object.entries(r.byType) as [AlertType, number][])
    .filter(([t, n]) => n >= 2 && !["fall", "inactivity", "up_at_night"].includes(t))
    .map(([t, n]) => `${TYPE_LABEL[t]} ${n}×`);
  if (repeated.length) parts.push(`repeated: ${repeated.join(", ")}`);
  if (r.open) parts.push(`${plural(r.open, "alert")} still open`);
  if (parts.length === 0) parts.push(`${plural(r.total, "alert")} tonight`);
  return parts.join(" · ");
}

export function ruleRecommendations(f: ShiftFacts): string[] {
  const recs: string[] = [];
  const byScore = [...f.residents].sort((a, b) => attentionScore(b) - attentionScore(a));
  for (const r of byScore) {
    if (r.falls >= 2) recs.push(`Room ${r.room} (${r.name}) had ${r.falls} falls tonight — review the fall-risk plan.`);
    else if (r.falls === 1) recs.push(`Room ${r.room} (${r.name}) fell overnight — check for injury and update the fall-risk assessment.`);
  }
  for (const r of byScore) {
    if (r.inactivity) recs.push(`Room ${r.room} (${r.name}) had a no-movement alert — see them first this morning.`);
    if (r.upAtNight >= 1) recs.push(`Room ${r.room} (${r.name}) was up at night ${r.upAtNight}× — review toileting and bed-exit plan.`);
  }
  if (f.totals.open) recs.push(`${plural(f.totals.open, "alert")} still open — hand them over in person.`);
  if (f.totals.escalations >= 2) {
    recs.push(`${f.totals.escalations} alerts escalated to the charge nurse — consider extra cover at peak times.`);
  }
  for (const r of byScore) {
    const water = r.byType.need_water ?? 0;
    const bath = r.byType.need_bathroom ?? 0;
    if (water >= 2) recs.push(`Room ${r.room} (${r.name}) asked for water ${water}× — leave water within reach at bedtime.`);
    if (bath >= 2) recs.push(`Room ${r.room} (${r.name}) needed the bathroom ${bath}× — consider a scheduled toileting round.`);
  }
  const unique = [...new Set(recs)].slice(0, 3);
  return unique.length ? unique : ["Quiet night — no follow-ups needed beyond the usual morning checks."];
}

export function ruleNurseNote(n: NurseFacts): string {
  if (n.alerts === 0) return "No alerts tonight.";
  const parts = [`Handled ${n.handled} of ${n.alerts}`];
  if (n.role === "Charge") parts[0] = `Received ${plural(n.alerts, "escalation")}, handled ${n.handled}`;
  if (n.open.length) parts.push(`${plural(n.open.length, "alert")} left open`);
  return parts.join("; ") + ".";
}

export function ruleHandoff(f: ShiftFacts, now: number): Handoff {
  const attention = [...f.residents]
    .filter(needsAttention)
    .sort((a, b) => attentionScore(b) - attentionScore(a))
    .slice(0, 8)
    .map((r) => ({ room: r.room, name: r.name, reason: ruleReason(r) }));
  return finalize({
    source: "rules",
    generatedAt: now,
    totals: f.totals,
    needsAttention: attention,
    nurses: f.nurses.map((n) => ({ ...n, note: ruleNurseNote(n) })),
    recommendations: ruleRecommendations(f),
  });
}

export function formatMs(ms: number | null): string {
  if (ms == null) return "—";
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Adds the plain-text version used by the Copy button. */
export function finalize(h: Omit<Handoff, "text">): Handoff {
  const lines = [
    "KIJO — NIGHT SHIFT HANDOFF",
    `${h.totals.alerts} alerts (P1 ${h.totals.p1} · P2 ${h.totals.p2} · P3 ${h.totals.p3}) · ${h.totals.escalations} escalated · ${h.totals.open} still open`,
    "",
    "NEEDS ATTENTION THIS MORNING",
    ...(h.needsAttention.length ? h.needsAttention.map((a) => `- Room ${a.room} · ${a.name}: ${a.reason}`) : ["- Nobody flagged."]),
    "",
    "BY NURSE",
    ...h.nurses.map(
      (n) =>
        `- ${n.name} (${n.role}): ${n.handled}/${n.alerts} handled · avg response ${formatMs(n.avgResponseMs)}` +
        (n.open.length ? ` · open: ${n.open.map((o) => `Room ${o.room} ${TYPE_LABEL[o.type]}`).join(", ")}` : "") +
        (n.note ? ` — ${n.note}` : ""),
    ),
    "",
    "RECOMMENDATIONS",
    ...h.recommendations.map((r, i) => `${i + 1}. ${r}`),
    "",
    h.source === "claude" ? "Drafted by Claude from tonight's alerts — verify before acting." : "Rule-based summary from tonight's alerts.",
  ];
  return { ...h, text: lines.join("\n") };
}
