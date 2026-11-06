"use client";

import { useEffect } from "react";
import useSWR from "swr";
import type { AlertHistoryItem } from "@/app/api/residents/[id]/history/route";
import type { Alert, Nurse, Resident } from "@/lib/types";
import {
  ALERT_ICON,
  ALERT_LABEL,
  LANGUAGE_NAME,
  OK_STROKE,
  PRIORITY,
  formatDuration,
  initials,
  maskPhone,
  sortAlerts,
} from "./util";
import PulseLine from "./PulseLine";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3 py-1.5 text-sm">
      <span className="w-28 shrink-0 text-slate-400">{label}</span>
      <span className="text-slate-100">{children}</span>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-slate-800 px-5 py-3">
      <h3 className="mb-1 text-[11px] font-semibold tracking-widest text-slate-500">{title}</h3>
      {children}
    </section>
  );
}

const FALL_RISK_STYLE: Record<Resident["fallRisk"], string> = {
  Low: "text-slate-200",
  Medium: "text-orange-200",
  High: "font-semibold text-orange-400",
};

export default function ResidentDrawer({
  resident,
  heartRate,
  nurses,
  alerts,
  now,
  onClose,
}: {
  resident: Resident;
  heartRate: number; // displayed value (may include client-side drift)
  nurses: Nurse[];
  alerts: Alert[];
  now: number | null;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const { data: historyData } = useSWR<{ alerts: AlertHistoryItem[] }>(
    `/api/residents/${encodeURIComponent(resident.id)}/history`,
    (url: string) => fetch(url, { cache: "no-store" }).then((r) => (r.ok ? r.json() : Promise.reject(r.status))),
    { refreshInterval: 3000 },
  );
  const history = historyData?.alerts;

  const nurse = nurses.find((n) => n.id === resident.assignedNurseId);
  const active = sortAlerts(alerts.filter((a) => a.residentId === resident.id));
  const top = active[0];
  const dnr = resident.codeStatus === "DNR";

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label={`${resident.name} quick info`}>
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-black/60" />
      <aside className="kijo-drawer-enter relative flex h-full w-full max-w-md flex-col overflow-y-auto border-l border-slate-800 bg-[#0b1120] shadow-2xl">
        <div className="flex items-center justify-between px-5 pt-4">
          <span className="rounded border border-slate-600 px-2 py-0.5 text-[10px] font-semibold tracking-widest text-slate-400">
            DEMO DATA · FICTIONAL RESIDENT
          </span>
          <button type="button" onClick={onClose} className="text-xl text-slate-400 hover:text-white" aria-label="Close">
            ×
          </button>
        </div>

        {/* Code status first, large */}
        <div
          className={`mx-5 mt-3 rounded-lg border-2 px-4 py-3 text-center text-3xl font-black tracking-wide ${
            dnr ? "border-fuchsia-400 bg-fuchsia-500/15 text-fuchsia-200" : "border-slate-500 bg-slate-800/60 text-white"
          }`}
        >
          {dnr ? "DNR" : "FULL CODE"}
        </div>

        <div className="flex items-center gap-4 px-5 py-4">
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-teal-500/20 text-xl font-bold text-teal-300">
            {initials(resident.name)}
          </span>
          <div className="min-w-0">
            <div className="text-xl font-semibold text-white">{resident.name}</div>
            <div className="text-sm text-slate-400">
              {resident.age} y · Room {resident.room} · {resident.wing} wing
            </div>
            <div className="text-sm text-slate-400">
              Nurse: <span className="text-slate-200">{nurse?.name ?? "—"}</span>
              {now != null && <> · last motion {formatDuration(now - resident.lastMotionAt)} ago</>}
            </div>
          </div>
        </div>

        <Section title="LIVE">
          <div className="flex items-center gap-4">
            <span className={`font-mono text-3xl ${top ? PRIORITY[top.priority].text : "text-emerald-400"}`}>
              {heartRate}
              <span className="ml-1 text-sm text-slate-500">bpm</span>
            </span>
            <div className="flex-1">
              <PulseLine heartRate={resident.heartRate} color={top ? PRIORITY[top.priority].stroke : OK_STROKE} />
            </div>
          </div>
        </Section>

        <Section title="SAFETY">
          <Row label="Fall risk">
            <span className={FALL_RISK_STYLE[resident.fallRisk]}>{resident.fallRisk}</span>
          </Row>
          <Row label="Mobility">{resident.mobility}</Row>
          <Row label="Cognition">{resident.cognition}</Row>
          <Row label="Allergies">
            {resident.allergies.length === 0 ? (
              <span className="text-slate-400">None known</span>
            ) : (
              <span className="flex flex-wrap gap-1">
                {resident.allergies.map((a) => (
                  // Purple outline, not red: red is reserved for alarms.
                  <span
                    key={a}
                    className="rounded border border-violet-400 bg-violet-500/10 px-2 py-0.5 text-xs font-semibold text-violet-200"
                  >
                    <span className="text-violet-400">Allergy ·</span> {a}
                  </span>
                ))}
              </span>
            )}
          </Row>
        </Section>

        <Section title="COMMUNICATION">
          <Row label="Language">{LANGUAGE_NAME[resident.language]}</Row>
          <Row label="Can speak">{resident.canSpeak ? "Yes — voice enabled" : "No — buttons / gesture only"}</Row>
        </Section>

        <Section title="CARE NOTES">
          <p className="py-1 text-sm text-slate-100">{resident.careNotes || "—"}</p>
        </Section>

        <Section title="EMERGENCY CONTACT">
          <Row label={resident.emergencyContact.relation}>{resident.emergencyContact.name}</Row>
          <Row label="Phone">
            <span className="font-mono">{maskPhone(resident.emergencyContact.phone)}</span>
          </Row>
        </Section>

        <Section title="LAST 5 ALERTS">
          {!history ? (
            <p className="py-1 text-sm text-slate-500">Loading…</p>
          ) : history.length === 0 ? (
            <p className="py-1 text-sm text-slate-400">No alerts yet</p>
          ) : (
            <ul className="py-1">
              {history.map((a) => (
                <li key={a.id} className="flex items-center gap-2 py-1 text-sm">
                  <span className={`rounded px-1.5 text-xs font-bold text-slate-950 ${PRIORITY[a.priority].bg}`}>
                    {PRIORITY[a.priority].label}
                  </span>
                  <span className="min-w-0 truncate">
                    {ALERT_ICON[a.type]} {ALERT_LABEL[a.type]}
                    <span className="text-slate-500"> · {a.status}</span>
                    {a.escalatedTo && <span className="text-red-400"> · escalated</span>}
                  </span>
                  <span className="ml-auto shrink-0 text-right font-mono text-xs">
                    <span className={a.responseMs != null ? "text-teal-300" : "text-slate-500"}>
                      {a.responseMs != null ? `ack ${formatDuration(a.responseMs)}` : "no ack"}
                    </span>
                    {now != null && <span className="text-slate-500"> · {formatDuration(now - a.createdAt)} ago</span>}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </aside>
    </div>
  );
}
