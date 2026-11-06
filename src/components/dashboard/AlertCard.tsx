"use client";

import { ArrowUpRight, Check, CheckCircle, Heartbeat, UserCircle } from "@phosphor-icons/react";
import { useState } from "react";
import { RESIDENT_OK_SUFFIX, residentSaysOk } from "@/lib/detection/alertRules";
import type { Alert, Nurse, Resident } from "@/lib/types";
import CountdownRing from "./CountdownRing";
import {
  ALERT_ICON,
  ALERT_LABEL,
  ESCALATION_MS,
  PRIORITY,
  formatDuration,
  initials,
  nurseShort,
  patchAlert,
} from "./util";

// Buttons: 48px tall on touch screens, 36px at lg.
const BTN = "inline-flex h-12 items-center justify-center gap-2 rounded-btn px-4 text-base font-semibold transition-colors disabled:opacity-50 lg:h-9 lg:px-3 lg:text-sm";
const SECONDARY = `${BTN} border border-line-2 text-ink hover:bg-surface`;

export default function AlertCard({
  alert,
  resident,
  nurses,
  now,
  onChanged,
  onSelectResident,
  actingNurseId,
}: {
  alert: Alert;
  resident?: Resident;
  nurses: Nurse[];
  now: number; // server-aligned ms
  onChanged: () => void;
  onSelectResident: (id: string) => void;
  actingNurseId?: string;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [assistId, setAssistId] = useState("");

  const p = PRIORITY[alert.priority];
  const TypeIcon = ALERT_ICON[alert.type];
  const isOpen = alert.status === "open";
  const nurseById = new Map(nurses.map((n) => [n.id, n]));
  const assigned = nurseById.get(alert.assignedNurseId);
  const escalatedTo = alert.escalatedTo ? nurseById.get(alert.escalatedTo) : undefined;
  const assisting = alert.assistingNurseIds ?? [];
  const assistOptions = nurses.filter((n) => n.id !== alert.assignedNurseId && !assisting.includes(n.id));
  const age = now - alert.createdAt;
  const remaining = isOpen ? ESCALATION_MS - age : null;
  const saysOk = alert.priority === 1 && residentSaysOk(alert.summary);
  const summary = saysOk ? alert.summary.slice(0, -RESIDENT_OK_SUFFIX.length) : alert.summary;

  async function run(action: string, nurseId?: string) {
    setBusy(action);
    setError(null);
    try {
      await patchAlert(alert.id, { action, nurseId });
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <article
      className={`kijo-card-enter relative shrink-0 overflow-hidden rounded-card bg-surface-2 p-4 pl-5 ${
        escalatedTo ? `border-2 border-alarm ${isOpen ? "kijo-border-flash" : ""}` : "border border-line-2"
      }`}
    >
      <span aria-hidden className={`absolute inset-y-0 left-0 w-1 ${p.bg} ${isOpen ? p.flash : ""}`} />

      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-2 py-0.5 text-xs font-semibold text-bg ${p.bg}`}>{p.label}</span>
            <span className="inline-flex items-center gap-1.5 text-sm font-medium text-ink">
              <TypeIcon size={18} weight="bold" aria-hidden />
              {ALERT_LABEL[alert.type]}
            </span>
            {escalatedTo && (
              <span className="inline-flex items-center gap-1 rounded-full border border-alarm px-2 py-0.5 text-xs font-semibold text-ink">
                <ArrowUpRight size={12} weight="bold" className="text-alarm" aria-hidden />
                Escalated to {nurseShort(escalatedTo)}
              </span>
            )}
            {!isOpen && (
              <span className="inline-flex items-center gap-1 rounded-full border border-line-2 bg-surface px-2 py-0.5 text-xs font-medium text-ink">
                <Check size={12} weight="bold" aria-hidden />
                On it
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={() => resident && onSelectResident(resident.id)}
            className="mt-2 rounded text-left text-base font-semibold text-ink hover:underline"
          >
            Room {resident?.room ?? "?"} · {resident?.name ?? "Unknown resident"}
          </button>
        </div>
        <div className="flex flex-col items-end gap-1">
          <CountdownRing remainingMs={remaining} totalMs={ESCALATION_MS} color={p.stroke} />
          <span className="num text-xs text-muted">{formatDuration(age)} ago</span>
        </div>
      </div>

      {saysOk && (
        <span className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-ok/50 bg-ok/10 px-2 py-0.5 text-xs font-medium text-ink">
          <CheckCircle size={14} weight="bold" className="text-ok" aria-hidden />
          Resident says OK — still check
        </span>
      )}
      <p className="mt-2 text-sm text-ink/90">{summary}</p>
      {alert.transcript && <p className="mt-1 text-sm italic text-muted">“{alert.transcript}”</p>}

      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
        {alert.heartRate != null && (
          <span className="inline-flex items-center gap-1">
            <Heartbeat size={14} aria-hidden />
            <span className="num text-ink">{alert.heartRate}</span> bpm
          </span>
        )}
        <span className="inline-flex items-center gap-1">
          <UserCircle size={14} aria-hidden />
          <span className="text-ink">{assigned?.name ?? "Unassigned"}</span>
        </span>
        {assisting.length > 0 && (
          <span className="flex items-center gap-1">
            Assisting
            {assisting.map((id) => (
              <span
                key={id}
                title={nurseById.get(id)?.name}
                className="rounded-full border border-line-2 px-1.5 text-xs font-medium text-ink"
              >
                {initials(nurseById.get(id)?.name ?? id)}
              </span>
            ))}
          </span>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {isOpen && (
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => run("acknowledge", actingNurseId)}
            className={`${BTN} bg-brand text-bg hover:bg-brand/85`}
          >
            {busy === "acknowledge" ? "…" : "I'm on it"}
          </button>
        )}
        <button type="button" disabled={busy !== null} onClick={() => run("resolve")} className={SECONDARY}>
          {busy === "resolve" ? "…" : "Resolve"}
        </button>
        {alert.priority === 1 && assistOptions.length > 0 && (
          <span className="flex items-center gap-2">
            <select
              value={assistId}
              onChange={(e) => setAssistId(e.target.value)}
              className="h-12 rounded-btn border border-line-2 bg-surface px-2 text-sm text-ink lg:h-9"
              aria-label="Nurse to assist"
            >
              <option value="">Nurse…</option>
              {assistOptions.map((n) => (
                <option key={n.id} value={n.id}>
                  {nurseShort(n)}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={busy !== null || !assistId}
              onClick={async () => {
                await run("assist", assistId);
                setAssistId("");
              }}
              className={SECONDARY}
            >
              {busy === "assist" ? "…" : "Assist"}
            </button>
          </span>
        )}
        {error && <span className="text-xs text-ink">{error}</span>}
      </div>
    </article>
  );
}
