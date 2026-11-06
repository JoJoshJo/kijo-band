"use client";

import type { Alert, Nurse } from "@/lib/types";
import { Avatar, NurseStatus } from "./NursePod";

/** Bottom bar: every nurse with role, wing, status and their open-alert count (incl. escalations to them). */
export default function NurseBar({ nurses, alerts }: { nurses: Nurse[]; alerts: Alert[] }) {
  return (
    <footer className="flex items-center gap-2 border-t border-line bg-bg px-4 py-2">
      <span className="label-caps pr-2">Nurses</span>
      {nurses.map((n) => {
        const open = alerts.filter(
          (a) => a.status === "open" && (a.assignedNurseId === n.id || a.escalatedTo === n.id),
        ).length;
        return (
          <div key={n.id} className="flex flex-1 items-center gap-2 rounded-card border border-line bg-surface px-3 py-2">
            <Avatar name={n.name} />
            <span className="text-sm font-semibold text-ink">{n.name.replace(/^Nurse\s+/, "")}</span>
            <span className="hidden text-xs text-muted 2xl:inline">
              {n.role} · {n.wing}
            </span>
            <NurseStatus nurse={n} />
            <span
              className={`num ml-auto rounded-full px-2 py-0.5 text-xs ${open > 0 ? "bg-surface-2 text-ink" : "text-muted"}`}
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
