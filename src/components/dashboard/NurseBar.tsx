"use client";

import type { Alert, Nurse } from "@/lib/types";
import { initials } from "./util";

/** Bottom bar: every nurse with role, wing, status and their open-alert count (incl. escalations to them). */
export default function NurseBar({ nurses, alerts }: { nurses: Nurse[]; alerts: Alert[] }) {
  return (
    <footer className="flex items-center gap-2 border-t border-slate-800 px-3 py-2">
      <span className="px-2 text-[11px] font-semibold tracking-widest text-slate-500">NURSES</span>
      {nurses.map((n) => {
        const open = alerts.filter(
          (a) => a.status === "open" && (a.assignedNurseId === n.id || a.escalatedTo === n.id),
        ).length;
        const responding = n.status === "responding";
        return (
          <div
            key={n.id}
            className="flex flex-1 items-center gap-2 rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-1.5"
          >
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-teal-500/20 text-xs font-bold text-teal-300">
              {initials(n.name)}
            </span>
            <span className="font-semibold text-white">{n.name.replace(/^Nurse\s+/, "")}</span>
            <span className="text-xs text-slate-400">
              {n.role} · {n.wing}
            </span>
            <span className={`text-xs ${responding ? "text-teal-300" : "text-emerald-400/80"}`}>
              ● {responding ? "responding" : "available"}
            </span>
            <span
              className={`ml-auto rounded px-2 py-0.5 font-mono text-xs ${
                open > 0 ? "bg-slate-700 text-white" : "text-slate-500"
              }`}
              title="Open (unacknowledged) alerts"
            >
              {open} open
            </span>
          </div>
        );
      })}
    </footer>
  );
}
