"use client";

import type { Alert, Resident } from "@/lib/types";
import PulseLine from "./PulseLine";
import { ALERT_LABEL, OK_STROKE, PRIORITY } from "./util";

export default function ResidentTile({
  resident,
  heartRate,
  alert,
  onSelect,
  size = "md",
}: {
  size?: "md" | "lg"; // lg = per-nurse view (fewer, bigger tiles)
  resident: Resident;
  heartRate: number; // displayed value (may include client-side drift)
  alert?: Alert; // highest-priority active alert only
  onSelect: (id: string) => void;
}) {
  const p = alert ? PRIORITY[alert.priority] : null;
  // Acknowledged alarms stay colored but stop flashing.
  const flash = alert && alert.status === "open" ? p?.flash : "";
  // Out-of-range HR (same thresholds as the band's vitals rule) — judged on the stored value, not the drift.
  const hrWarning = resident.heartRate > 130 || resident.heartRate < 45;
  const lg = size === "lg";

  return (
    <button
      type="button"
      onClick={() => onSelect(resident.id)}
      aria-label={`Room ${resident.room}, ${resident.name}, ${heartRate} bpm${hrWarning ? " (HR warning)" : ""}${
        alert ? `, ${PRIORITY[alert.priority].label} ${ALERT_LABEL[alert.type]}` : ", OK"
      } — open quick info`}
      className={`relative rounded-lg border-2 bg-slate-900/80 text-left ${lg ? "p-4" : "p-2.5"} transition hover:bg-slate-800/80 ${
        p ? p.border : "border-emerald-500/30"
      } ${flash}`}
    >
      <div className="flex items-baseline justify-between">
        <span className={`font-semibold tracking-wide text-slate-400 ${lg ? "text-sm" : "text-[11px]"}`}>
          ROOM {resident.room}
        </span>
        {!resident.canSpeak && (
          <span className={`text-slate-500 ${lg ? "text-xs" : "text-[10px]"}`}>non-verbal</span>
        )}
      </div>
      <div className={`truncate font-medium text-slate-100 ${lg ? "text-2xl" : "text-sm"}`}>{resident.name}</div>
      <PulseLine heartRate={resident.heartRate} color={p ? p.stroke : OK_STROKE} height={lg ? 72 : 32} />
      <div className="flex items-center justify-between">
        <span
          className={`font-mono leading-none ${lg ? "text-4xl" : "text-lg"} ${
            hrWarning ? "text-yellow-300" : p ? p.text : "text-emerald-400"
          }`}
        >
          {heartRate}
          <span className="ml-0.5 text-[10px] text-slate-500">bpm</span>
          {hrWarning && (
            <span className="ml-1 rounded border border-yellow-300 px-1 align-middle text-[9px] font-bold text-yellow-300">
              ⚠ HR
            </span>
          )}
        </span>
        {alert && p ? (
          <span
            className={`rounded px-1.5 py-0.5 font-bold text-slate-950 ${p.bg} ${lg ? "text-sm" : "text-[10px]"}`}
          >
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
