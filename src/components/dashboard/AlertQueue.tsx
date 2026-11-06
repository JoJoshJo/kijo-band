"use client";

import type { Alert, Nurse, Resident } from "@/lib/types";
import AlertCard from "./AlertCard";
import { sortAlerts } from "./util";

export default function AlertQueue({
  alerts,
  residents,
  nurses,
  now,
  onChanged,
  onSelectResident,
}: {
  alerts: Alert[];
  residents: Resident[];
  nurses: Nurse[];
  now: number | null;
  onChanged: () => void;
  onSelectResident: (id: string) => void;
}) {
  const residentById = new Map(residents.map((r) => [r.id, r]));
  const sorted = sortAlerts(alerts);

  return (
    <section className="flex min-h-0 flex-col rounded-xl border border-slate-800 bg-slate-950/60">
      <h2 className="flex items-center justify-between border-b border-slate-800 px-3 py-2 text-xs font-semibold tracking-widest text-slate-400">
        PRIORITY QUEUE
        <span className="font-mono text-slate-300">{sorted.length}</span>
      </h2>
      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-2">
        {sorted.length === 0 ? (
          <p className="px-2 py-6 text-center text-sm text-emerald-400/80">All quiet — no active alerts</p>
        ) : (
          now != null &&
          sorted.map((a) => (
            <AlertCard
              key={a.id}
              alert={a}
              resident={residentById.get(a.residentId)}
              nurses={nurses}
              now={now}
              onChanged={onChanged}
              onSelectResident={onSelectResident}
            />
          ))
        )}
      </div>
    </section>
  );
}
