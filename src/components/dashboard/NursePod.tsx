"use client";

import type { Alert, Nurse, Resident } from "@/lib/types";
import ResidentTile from "./ResidentTile";
import { initials, topAlertFor } from "./util";

export function NurseStatus({ nurse }: { nurse: Nurse }) {
  const responding = nurse.status === "responding";
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted">
      <span className={`h-2 w-2 rounded-full ${responding ? "bg-ink" : "bg-ok"}`} aria-hidden />
      {responding ? <span className="text-ink">Responding</span> : "Available"}
    </span>
  );
}

export function Avatar({ name, size = 28 }: { name: string; size?: number }) {
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-full border border-line-2 bg-surface-2 text-xs font-semibold text-ink"
      style={{ width: size, height: size }}
      aria-hidden
    >
      {initials(name)}
    </span>
  );
}

export function NursePod({
  nurse,
  residents,
  alerts,
  heartRateOf,
  onSelect,
}: {
  nurse: Nurse;
  residents: Resident[];
  alerts: Alert[];
  heartRateOf: (r: Resident) => number;
  onSelect: (id: string) => void;
}) {
  const ids = new Set(residents.map((r) => r.id));
  const active = alerts.filter((a) => ids.has(a.residentId)).length;
  return (
    <section aria-label={`${nurse.name}'s residents`} className="rounded-card border border-line bg-surface p-3">
      <header className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1">
        <Avatar name={nurse.name} />
        <span className="text-sm font-semibold text-ink">{nurse.name}</span>
        <span className="text-xs text-muted">
          {nurse.role} · {nurse.wing}
        </span>
        <NurseStatus nurse={nurse} />
        <span className="ml-auto text-xs text-muted">
          {residents.length} residents
          {active > 0 && <span className="text-ink"> · {active} active</span>}
        </span>
      </header>
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        {residents.map((r) => (
          <ResidentTile
            key={r.id}
            resident={r}
            heartRate={heartRateOf(r)}
            alert={topAlertFor(alerts, r.id)}
            onSelect={onSelect}
          />
        ))}
      </div>
    </section>
  );
}

/** Compact badge for nurses with no assigned residents (e.g. the charge nurse). */
export function NurseBadge({ nurse, escalations }: { nurse: Nurse; escalations: number }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-card border border-line bg-surface px-3 py-2">
      <Avatar name={nurse.name} />
      <span className="text-sm font-semibold text-ink">{nurse.name}</span>
      <span className="text-xs text-muted">
        {nurse.role === "Charge" ? "Charge nurse · receives escalations" : `${nurse.role} · ${nurse.wing}`}
      </span>
      <NurseStatus nurse={nurse} />
      {escalations > 0 && <span className="ml-auto text-xs text-ink">{escalations} escalated</span>}
    </div>
  );
}
