"use client";

import { useState } from "react";
import useSWR from "swr";
import type { NightReport } from "@/app/api/report/route";
import type { AlertPriority } from "@/lib/types";
import HandoffPanel from "./HandoffPanel";
import Modal from "./Modal";
import { ALERT_LABEL, PRIORITY, formatDuration } from "./util";

/** Response times: "0.9s" / "42s" under a minute, else m:ss. */
function formatResponse(ms: number): string {
  if (ms < 10_000) return `${(ms / 1000).toFixed(1)}s`;
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
  return formatDuration(ms);
}

const PRIORITY_NAME: Record<AlertPriority, string> = { 1: "Critical", 2: "Urgent", 3: "Routine" };

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950/60 px-4 py-3">
      <div className="text-[11px] font-semibold tracking-widest text-slate-500">{label}</div>
      <div className="mt-1 font-mono text-3xl text-white">{value}</div>
      {sub && <div className="mt-0.5 text-xs leading-snug text-slate-400">{sub}</div>}
    </div>
  );
}

/** One series (alert count) × 3 priorities. Bars wear the alarm colors; labels carry identity in ink. */
function PriorityBars({ byPriority }: { byPriority: NightReport["byPriority"] }) {
  const [hover, setHover] = useState<AlertPriority | null>(null);
  const priorities: AlertPriority[] = [1, 2, 3];
  const max = Math.max(1, ...priorities.map((p) => byPriority[p]));
  const H = 160;

  return (
    <figure>
      <figcaption className="mb-3 text-[11px] font-semibold tracking-widest text-slate-500">ALERTS BY PRIORITY</figcaption>
      <div className="relative flex items-end gap-6 border-b border-slate-700 px-4" style={{ height: H + 28 }}>
        {priorities.map((p) => {
          const n = byPriority[p];
          const h = n === 0 ? 0 : Math.max(4, Math.round((n / max) * H));
          return (
            <div
              key={p}
              className="relative flex flex-1 flex-col items-center justify-end self-stretch"
              onMouseEnter={() => setHover(p)}
              onMouseLeave={() => setHover(null)}
            >
              <span className="mb-1 font-mono text-sm text-slate-200">{n}</span>
              <div
                className={`w-full max-w-24 rounded-t ${PRIORITY[p].bg} transition-opacity ${
                  hover != null && hover !== p ? "opacity-50" : ""
                }`}
                style={{ height: h }}
              />
              {hover === p && (
                <div className="pointer-events-none absolute -top-2 z-10 -translate-y-full whitespace-nowrap rounded border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-200 shadow">
                  {PRIORITY[p].label} {PRIORITY_NAME[p]}: <b>{n}</b> alert{n === 1 ? "" : "s"}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="flex gap-6 px-4 pt-1.5">
        {priorities.map((p) => (
          <div key={p} className="flex-1 text-center text-xs text-slate-300">
            {PRIORITY[p].label} · {PRIORITY_NAME[p]}
          </div>
        ))}
      </div>
      {/* Table view for screen readers */}
      <table className="sr-only">
        <caption>Alerts by priority</caption>
        <tbody>
          {priorities.map((p) => (
            <tr key={p}>
              <th scope="row">{PRIORITY[p].label} {PRIORITY_NAME[p]}</th>
              <td>{byPriority[p]}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

export default function NightReportModal({ onClose }: { onClose: () => void }) {
  const { data, error } = useSWR<NightReport>(
    "/api/report",
    (url: string) => fetch(url, { cache: "no-store" }).then((r) => (r.ok ? r.json() : Promise.reject(r.status))),
    { refreshInterval: 3000 },
  );

  return (
    <Modal title="Night Report" onClose={onClose} wide>
      {error ? (
        <p className="text-sm text-orange-300">Could not load the report.</p>
      ) : !data ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : (
        <div className="flex flex-col gap-5">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="TOTAL ALERTS" value={String(data.total)} sub={`${data.stillOpen} still open`} />
            <Stat
              label="AVG ACK TIME"
              value={data.avgAckMs == null ? "—" : formatResponse(data.avgAckMs)}
              sub={`${data.acknowledged} acknowledged`}
            />
            <Stat
              label="SLOWEST ACK"
              value={data.slowest ? formatResponse(data.slowest.ackMs) : "—"}
              sub={
                data.slowest
                  ? `Room ${data.slowest.room} · ${data.slowest.name} · ${ALERT_LABEL[data.slowest.type]}`
                  : "No acknowledged alerts yet"
              }
            />
            <Stat label="ESCALATIONS" value={String(data.escalations)} sub="to charge nurse" />
          </div>
          <PriorityBars byPriority={data.byPriority} />
          <HandoffPanel />
          <p className="text-[11px] text-slate-500">All alerts since the last demo reset · fictional demo data</p>
        </div>
      )}
    </Modal>
  );
}
