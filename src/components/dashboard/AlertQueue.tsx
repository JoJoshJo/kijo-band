"use client";

import { CheckCircle } from "@phosphor-icons/react";

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
  actingNurseId,
  loading = false,
  residentCount,
}: {
  alerts: Alert[];
  residents: Resident[];
  nurses: Nurse[];
  now: number | null;
  onChanged: () => void;
  onSelectResident: (id: string) => void;
  /** Nurse view: whoever taps Acknowledge here becomes responding. Unset on the Charge view. */
  actingNurseId?: string;
  /** No data yet → don't claim "all quiet". */
  loading?: boolean;
  /** Residents this queue covers, for the empty state. */
  residentCount?: number;
}) {
  const residentById = new Map(residents.map((r) => [r.id, r]));
  const sorted = sortAlerts(alerts);

  return (
    <section className="flex min-h-0 flex-col rounded-card border border-line bg-surface">
      <h2 className="flex items-center justify-between border-b border-line px-4 py-3">
        <span className="label-caps">Priority queue</span>
        <span className="num rounded-full bg-surface-2 px-2 text-xs text-ink">{sorted.length}</span>
      </h2>
      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-2">
        {sorted.length === 0 ? (
          loading ? (
            <p className="px-2 py-8 text-center text-sm text-muted">Loading…</p>
          ) : (
            <div className="flex flex-col items-center gap-2 px-2 py-12 text-center">
              <CheckCircle size={40} className="text-ok" aria-hidden />
              <p className="mt-2 text-base font-semibold text-ink">All quiet</p>
              <p className="text-sm text-muted">
                {residentCount === undefined
                  ? "No active alerts"
                  : residentCount === 0
                    ? "No residents assigned"
                    : `${residentCount} resident${residentCount === 1 ? "" : "s"}, all OK`}
              </p>
            </div>
          )
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
              actingNurseId={actingNurseId}
            />
          ))
        )}
      </div>
    </section>
  );
}
