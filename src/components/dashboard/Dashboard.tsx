"use client";

import { useCallback, useState } from "react";
import useSWR from "swr";
import type { Resident, StateResponse } from "@/lib/types";
import AlertQueue from "./AlertQueue";
import Header from "./Header";
import { NurseBadge, NursePod } from "./NursePod";
import ResidentDrawer from "./ResidentDrawer";
import { useEscalation } from "./useEscalation";
import { useHeartRateDrift } from "./useHeartRateDrift";
import { useNow } from "./util";

const fetcher = async (url: string): Promise<StateResponse> => {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
};

export default function Dashboard({ logoSrc }: { logoSrc: string | null }) {
  const [skew, setSkew] = useState(0); // serverTime - clientTime, so timers match the DB clock
  const { track, displayHr } = useHeartRateDrift();
  const { data, error, mutate } = useSWR<StateResponse>("/api/state", fetcher, {
    refreshInterval: 1000,
    onSuccess: (d) => {
      setSkew(d.serverTime - Date.now());
      track(d.residents);
    },
  });
  const clientNow = useNow(500);
  const now = clientNow == null ? null : clientNow + skew;

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const refresh = useCallback(() => void mutate(), [mutate]);
  const closeDrawer = useCallback(() => setSelectedId(null), []);

  const residents = data?.residents ?? [];
  const nurses = data?.nurses ?? [];
  const alerts = data?.alerts ?? [];
  useEscalation(alerts, now, refresh);
  const heartRateOf = useCallback((r: Resident) => displayHr(r, clientNow), [displayHr, clientNow]);

  const selected = selectedId ? residents.find((r) => r.id === selectedId) : undefined;

  const podNurses = nurses.filter((n) => residents.some((r) => r.assignedNurseId === n.id));
  const badgeNurses = nurses.filter((n) => !podNurses.includes(n));

  return (
    <div className="flex h-screen flex-col bg-[#070b14] text-slate-100">
      <Header
        logoSrc={logoSrc}
        nursesOn={nurses.length}
        openCount={alerts.filter((a) => a.status === "open").length}
        live={error ? "offline" : data ? "live" : "connecting"}
      />

      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_400px_300px] gap-3 p-3">
        {/* Nurse pods */}
        <div className="flex min-h-0 flex-col gap-3 overflow-y-auto pr-1">
          {badgeNurses.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {badgeNurses.map((n) => (
                <NurseBadge key={n.id} nurse={n} escalations={alerts.filter((a) => a.escalatedTo === n.id).length} />
              ))}
            </div>
          )}
          {podNurses.map((n) => (
            <NursePod
              key={n.id}
              nurse={n}
              residents={residents.filter((r) => r.assignedNurseId === n.id)}
              alerts={alerts}
              heartRateOf={heartRateOf}
              onSelect={setSelectedId}
            />
          ))}
        </div>

        <AlertQueue
          alerts={alerts}
          residents={residents}
          nurses={nurses}
          now={now}
          onChanged={refresh}
          onSelectResident={setSelectedId}
        />

        {/* Presenter phone frame — reserved for checkpoint 5 (intentionally empty). */}
        <aside className="rounded-xl border border-dashed border-slate-800" aria-hidden />
      </div>

      {selected && (
        <ResidentDrawer
          resident={selected}
          heartRate={heartRateOf(selected)}
          nurses={nurses}
          alerts={alerts}
          now={now}
          onClose={closeDrawer}
        />
      )}
    </div>
  );
}
