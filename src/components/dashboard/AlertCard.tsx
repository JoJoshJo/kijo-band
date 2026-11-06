"use client";

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
  const isOpen = alert.status === "open";
  const nurseById = new Map(nurses.map((n) => [n.id, n]));
  const assigned = nurseById.get(alert.assignedNurseId);
  const escalatedTo = alert.escalatedTo ? nurseById.get(alert.escalatedTo) : undefined;
  const assisting = alert.assistingNurseIds ?? [];
  const assistOptions = nurses.filter((n) => n.id !== alert.assignedNurseId && !assisting.includes(n.id));
  const age = now - alert.createdAt;
  const remaining = isOpen ? ESCALATION_MS - age : null;

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
      className={`kijo-card-enter relative overflow-hidden rounded-lg bg-slate-900/90 p-3 pl-4 ${
        escalatedTo ? `border-2 border-red-500 ${isOpen ? "kijo-border-flash" : ""}` : "border border-slate-700"
      }`}
    >
      <span className={`absolute inset-y-0 left-0 w-1.5 ${p.bg} ${isOpen ? p.flash : ""}`} />

      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded px-1.5 py-0.5 text-xs font-bold text-slate-950 ${p.bg} ${isOpen ? p.flash : ""}`}>
              {p.label}
            </span>
            <span className="text-sm text-slate-300">
              {ALERT_ICON[alert.type]} {ALERT_LABEL[alert.type]}
            </span>
            {escalatedTo && (
              <span className="rounded bg-red-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
                ESCALATED → {nurseShort(escalatedTo)}
              </span>
            )}
            {!isOpen && (
              <span className="rounded bg-teal-500/20 px-1.5 py-0.5 text-[10px] font-bold text-teal-300">
                ACKNOWLEDGED
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={() => resident && onSelectResident(resident.id)}
            className="mt-1 text-left font-semibold text-white hover:underline"
          >
            Room {resident?.room ?? "?"} · {resident?.name ?? "Unknown resident"}
          </button>
        </div>
        <div className="flex flex-col items-end gap-1">
          <CountdownRing remainingMs={remaining} totalMs={ESCALATION_MS} color={p.stroke} />
          <span className="font-mono text-[11px] text-slate-400">{formatDuration(age)} ago</span>
        </div>
      </div>

      {alert.priority === 1 && residentSaysOk(alert.summary) ? (
        <>
          <span className="mt-1.5 inline-flex items-center gap-1.5 rounded border border-emerald-500/60 bg-emerald-500/15 px-2 py-0.5 text-xs font-semibold text-emerald-300">
            ✓ Resident says OK — still check
          </span>
          <p className="mt-1 text-sm text-slate-200">{alert.summary.slice(0, -RESIDENT_OK_SUFFIX.length)}</p>
        </>
      ) : (
        <p className="mt-1.5 text-sm text-slate-200">{alert.summary}</p>
      )}
      {alert.transcript && <p className="mt-1 text-sm italic text-slate-400">“{alert.transcript}”</p>}

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-400">
        {alert.heartRate != null && <span>♥ {alert.heartRate} bpm</span>}
        <span>
          → <span className="text-slate-200">{assigned?.name ?? "Unassigned"}</span>
        </span>
        {assisting.length > 0 && (
          <span className="flex items-center gap-1">
            assisting:
            {assisting.map((id) => (
              <span
                key={id}
                title={nurseById.get(id)?.name}
                className="rounded-full bg-teal-500/20 px-1.5 py-0.5 text-[10px] font-bold text-teal-300"
              >
                {initials(nurseById.get(id)?.name ?? id)}
              </span>
            ))}
          </span>
        )}
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        {isOpen && (
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => run("acknowledge", actingNurseId)}
            className="rounded bg-teal-600 px-3 py-1 text-sm font-semibold text-white hover:bg-teal-500 disabled:opacity-50"
          >
            {busy === "acknowledge" ? "…" : "Acknowledge"}
          </button>
        )}
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => run("resolve")}
          className="rounded bg-slate-700 px-3 py-1 text-sm font-semibold text-white hover:bg-slate-600 disabled:opacity-50"
        >
          {busy === "resolve" ? "…" : "Resolve"}
        </button>
        {alert.priority === 1 && assistOptions.length > 0 && (
          <span className="flex items-center gap-1">
            <select
              value={assistId}
              onChange={(e) => setAssistId(e.target.value)}
              className="rounded border border-slate-700 bg-slate-950 px-1.5 py-1 text-sm text-slate-200"
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
              className="rounded border border-teal-600 px-3 py-1 text-sm font-semibold text-teal-300 hover:bg-teal-600/20 disabled:opacity-40"
            >
              {busy === "assist" ? "…" : "Assist"}
            </button>
          </span>
        )}
        {error && <span className="text-xs text-orange-300">{error}</span>}
      </div>
    </article>
  );
}
