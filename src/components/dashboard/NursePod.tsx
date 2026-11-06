"use client";

import type { Alert, Nurse, Resident } from "@/lib/types";
import ResidentTile from "./ResidentTile";
import { initials, topAlertFor } from "./util";

function NurseStatus({ nurse }: { nurse: Nurse }) {
  const responding = nurse.status === "responding";
  return (
    <span className={`text-xs ${responding ? "text-teal-300" : "text-slate-400"}`}>
      ● {responding ? "responding" : "available"}
    </span>
  );
}

function Avatar({ name }: { name: string }) {
  return (
    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-teal-500/20 text-xs font-bold text-teal-300">
      {initials(name)}
    </span>
  );
}

export function NursePod({
  nurse,
  residents,
  alerts,
  onSelect,
}: {
  nurse: Nurse;
  residents: Resident[];
  alerts: Alert[];
  onSelect: (id: string) => void;
}) {
  const ids = new Set(residents.map((r) => r.id));
  const active = alerts.filter((a) => ids.has(a.residentId)).length;
  return (
    <section className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
      <header className="mb-2 flex items-center gap-2">
        <Avatar name={nurse.name} />
        <span className="font-semibold text-white">{nurse.name}</span>
        <span className="text-xs text-slate-400">
          {nurse.role} · {nurse.wing}
        </span>
        <NurseStatus nurse={nurse} />
        <span className="ml-auto text-xs text-slate-400">
          {residents.length} residents{active > 0 && ` · ${active} active`}
        </span>
      </header>
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        {residents.map((r) => (
          <ResidentTile key={r.id} resident={r} alert={topAlertFor(alerts, r.id)} onSelect={onSelect} />
        ))}
      </div>
    </section>
  );
}

/** Compact badge for nurses with no assigned residents (e.g. the charge nurse). */
export function NurseBadge({ nurse, escalations }: { nurse: Nurse; escalations: number }) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2">
      <Avatar name={nurse.name} />
      <span className="font-semibold text-white">{nurse.name}</span>
      <span className="text-xs text-slate-400">
        {nurse.role === "Charge" ? "Charge nurse · receives escalations" : `${nurse.role} · ${nurse.wing}`}
      </span>
      <NurseStatus nurse={nurse} />
      {escalations > 0 && <span className="ml-auto text-xs text-slate-300">{escalations} escalated</span>}
    </div>
  );
}
