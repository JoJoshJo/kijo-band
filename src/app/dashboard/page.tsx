"use client";

import useSWR from "swr";
import type { Alert, Nurse, Resident, StateResponse } from "@/lib/types";

const fetcher = async (url: string): Promise<StateResponse> => {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
};

const STATUS_STYLES: Record<Resident["status"], string> = {
  ok: "border-emerald-500/40",
  attention: "border-yellow-400",
  emergency: "border-red-500",
};

function topAlert(alerts: Alert[], residentId: string): Alert | undefined {
  return alerts
    .filter((a) => a.residentId === residentId)
    .sort((a, b) => a.priority - b.priority || a.createdAt - b.createdAt)[0];
}

function ResidentTile({ resident, alert }: { resident: Resident; alert?: Alert }) {
  return (
    <div className={`rounded-lg border-2 bg-slate-900 p-3 ${STATUS_STYLES[resident.status]}`}>
      <div className="flex items-baseline justify-between">
        <span className="text-xs text-slate-400">Room {resident.room}</span>
        <span className="text-xs uppercase text-slate-500">{resident.language}</span>
      </div>
      <div className="mt-1 font-medium">{resident.name}</div>
      <div className="mt-1 text-sm text-emerald-400">♥ {resident.heartRate} bpm</div>
      {alert && (
        <div className="mt-1 text-xs text-slate-300">
          P{alert.priority} · {alert.type}
        </div>
      )}
    </div>
  );
}

function NursePod({ nurse, residents, alerts }: { nurse: Nurse; residents: Resident[]; alerts: Alert[] }) {
  return (
    <section className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
      <h2 className="mb-3 text-sm text-slate-300">
        <span className="font-semibold text-white">{nurse.name}</span> · {nurse.role} · {nurse.wing} ·{" "}
        {nurse.status}
      </h2>
      {residents.length === 0 ? (
        <p className="text-sm text-slate-500">No assigned residents</p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {residents.map((r) => (
            <ResidentTile key={r.id} resident={r} alert={topAlert(alerts, r.id)} />
          ))}
        </div>
      )}
    </section>
  );
}

export default function DashboardPage() {
  const { data, error } = useSWR<StateResponse>("/api/state", fetcher, { refreshInterval: 1000 });

  return (
    <main className="min-h-screen bg-[#070b14] p-6 text-slate-100">
      <header className="mb-6 flex items-center gap-4">
        <h1 className="text-xl font-bold tracking-widest">KIJO</h1>
        <span className="text-slate-400">Night Shift</span>
        <span className={`ml-auto text-sm ${error ? "text-red-400" : "text-emerald-400"}`}>
          ● {error ? "Offline" : data ? "Live" : "Connecting…"}
        </span>
      </header>

      {data && (
        <div className="flex flex-col gap-4">
          {data.nurses.map((nurse) => (
            <NursePod
              key={nurse.id}
              nurse={nurse}
              residents={data.residents.filter((r) => r.assignedNurseId === nurse.id)}
              alerts={data.alerts}
            />
          ))}
        </div>
      )}
    </main>
  );
}
