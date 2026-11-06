"use client";

import type { Alert, Resident } from "@/lib/types";
import PulseLine from "./PulseLine";
import { ALERT_LABEL, OK_STROKE, PRIORITY } from "./util";

export default function ResidentTile({
  resident,
  heartRate,
  alert,
  onSelect,
}: {
  resident: Resident;
  heartRate: number; // displayed value (may include client-side drift)
  alert?: Alert; // highest-priority active alert only
  onSelect: (id: string) => void;
}) {
  const p = alert ? PRIORITY[alert.priority] : null;
  // Acknowledged alarms stay colored but stop flashing.
  const flash = alert && alert.status === "open" ? p?.flash : "";

  return (
    <button
      type="button"
      onClick={() => onSelect(resident.id)}
      aria-label={`Room ${resident.room}, ${resident.name}, ${heartRate} bpm${
        alert ? `, ${PRIORITY[alert.priority].label} ${ALERT_LABEL[alert.type]}` : ", OK"
      } — open quick info`}
      className={`relative rounded-lg border-2 bg-slate-900/80 p-2.5 text-left transition hover:bg-slate-800/80 ${
        p ? p.border : "border-emerald-500/30"
      } ${flash}`}
    >
      <div className="flex items-baseline justify-between">
        <span className="text-[11px] font-semibold tracking-wide text-slate-400">ROOM {resident.room}</span>
        {!resident.canSpeak && <span className="text-[10px] text-slate-500">non-verbal</span>}
      </div>
      <div className="truncate text-sm font-medium text-slate-100">{resident.name}</div>
      <PulseLine heartRate={resident.heartRate} color={p ? p.stroke : OK_STROKE} />
      <div className="flex items-center justify-between">
        <span className={`font-mono text-lg leading-none ${p ? p.text : "text-emerald-400"}`}>
          {heartRate}
          <span className="ml-0.5 text-[10px] text-slate-500">bpm</span>
        </span>
        {alert && p ? (
          <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold text-slate-950 ${p.bg}`}>
            {p.label} · {ALERT_LABEL[alert.type]}
            {alert.status === "acknowledged" ? " · ACK" : ""}
          </span>
        ) : (
          <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold text-emerald-400/80">OK</span>
        )}
      </div>
    </button>
  );
}
