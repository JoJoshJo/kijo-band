"use client";

import { CheckCircle, Warning } from "@phosphor-icons/react";
import type { Alert, MotionState, Resident } from "@/lib/types";
import PulseLine from "./PulseLine";
import { ALERT_ICON, ALERT_LABEL, CALM_STROKE, PRIORITY } from "./util";

const MOTION_LABEL: Record<MotionState, string> = { moving: "Moving", still: "Still", lying: "Lying" };

/** Calm by default: quiet surface + thin border. Only a tile with an active alarm gets color. */
export default function ResidentTile({
  resident,
  heartRate,
  alert,
  onSelect,
  size = "md",
  reserveCorner = false,
}: {
  reserveCorner?: boolean; // leave room top-right for the Charge view's resident menu
  size?: "md" | "lg"; // lg = per-nurse view (fewer, bigger tiles)
  resident: Resident;
  heartRate: number; // displayed value (may include client-side drift)
  alert?: Alert; // highest-priority active alert only
  onSelect: (id: string) => void;
}) {
  const p = alert ? PRIORITY[alert.priority] : null;
  const open = alert?.status === "open";
  // Out-of-range HR (same thresholds as the band's vitals rule) — judged on the stored value, not the drift.
  const hrWarning = resident.heartRate > 130 || resident.heartRate < 45;
  const lg = size === "lg";
  const TypeIcon = alert ? ALERT_ICON[alert.type] : null;

  return (
    <button
      type="button"
      onClick={() => onSelect(resident.id)}
      aria-label={`${resident.isGuest ? `${resident.name}, ${resident.room}` : `Room ${resident.room}, ${resident.name}`}, ${heartRate} bpm${hrWarning ? " (heart rate warning)" : ""}${
        alert ? `, ${p!.label} ${ALERT_LABEL[alert.type]}${open ? "" : " acknowledged"}` : ", OK"
      }${resident.motionState ? `, ${MOTION_LABEL[resident.motionState]}` : ""}. Open details`}
      className={`relative flex flex-col gap-1 rounded-card border text-left transition-colors ${lg ? "p-4" : "p-3"} ${
        p ? `${p.border} ${p.tint}` : "border-line-2 bg-surface-2 hover:border-muted/50"
      }`}
    >
      {/* Alarm flash on the outline only (IEC rate), so the text stays readable. Acknowledged = steady. */}
      {p && open && p.flash && (
        <span aria-hidden className={`pointer-events-none absolute -inset-px rounded-card border-2 ${p.border} ${p.flash}`} />
      )}
      <div className={`flex items-center justify-between gap-2 ${reserveCorner ? "min-h-6 pr-8" : ""}`}>
        <span className="label-caps">{resident.isGuest ? "Live resident" : `Room ${resident.room}`}</span>
        <span className="flex items-center gap-1">
          {!resident.canSpeak && <span className="text-xs text-muted">Non-verbal</span>}
          {resident.motionState && (
            <span title="Motion from the band" className="rounded-full border border-line-2 px-2 text-xs text-muted">
              {MOTION_LABEL[resident.motionState]}
            </span>
          )}
        </span>
      </div>
      <div className={`truncate font-medium text-ink ${lg ? "text-xl" : "text-sm"}`}>
        {resident.name}
        {resident.isGuest && <span className="text-muted"> · {resident.room}</span>}
      </div>
      <PulseLine heartRate={resident.heartRate} color={p ? p.stroke : CALM_STROKE} height={lg ? 64 : 28} />
      <div className="flex items-end justify-between gap-2">
        <span className="flex items-baseline gap-1">
          <span className={`num leading-none ${lg ? "text-display" : "text-xl"} ${hrWarning ? "text-warn-ink" : "text-ink"}`}>
            {heartRate}
          </span>
          <span className="text-xs text-muted">bpm</span>
          {hrWarning && (
            <span className="ml-1 inline-flex items-center gap-0.5 self-center rounded-full border border-warn px-1.5 text-xs font-medium text-warn-ink">
              <Warning size={12} weight="bold" aria-hidden />
              HR
            </span>
          )}
        </span>
        {alert && p && TypeIcon ? (
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold ${p.chip} ${lg ? "text-sm" : "text-xs"}`}
          >
            <TypeIcon size={lg ? 16 : 14} weight="bold" aria-hidden />
            {p.label}
            <span className={lg ? "" : "hidden sm:inline"}>· {ALERT_LABEL[alert.type]}</span>
            {!open && <span className="font-medium">· On it</span>}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-muted">
            <CheckCircle size={16} weight="bold" className="text-ok" aria-hidden />
            OK
          </span>
        )}
      </div>
    </button>
  );
}
