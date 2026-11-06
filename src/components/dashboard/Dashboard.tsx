"use client";

import { useCallback, useEffect, useState } from "react";
import useSWR from "swr";
import type { Resident, StateResponse } from "@/lib/types";
import AlertQueue from "./AlertQueue";
import Header from "./Header";
import { NurseBadge, NursePod } from "./NursePod";
import PresenterPanel from "./PresenterPanel";
import QrModal from "./QrModal";
import ResetModal from "./ResetModal";
import { useAlarmSounds } from "./useAlarmSounds";
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
  const [showPresenter, setShowPresenter] = useState(true);
  const [modal, setModal] = useState<"qr" | "reset" | null>(null);
  const closeModal = useCallback(() => setModal(null), []);

  // P toggles the presenter phone frame (ignored while typing in a field).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "p" && e.key !== "P") return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || ["INPUT", "SELECT", "TEXTAREA"].includes(t.tagName))) return;
      setShowPresenter((v) => !v);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const refresh = useCallback(() => void mutate(), [mutate]);
  const closeDrawer = useCallback(() => setSelectedId(null), []);

  const residents = data?.residents ?? [];
  const nurses = data?.nurses ?? [];
  const alerts = data?.alerts ?? [];
  useEscalation(alerts, now, refresh);
  const sound = useAlarmSounds(data?.alerts);
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
        actions={
          <>
            <button
              type="button"
              onClick={sound.toggleMute}
              title={sound.ready ? "Toggle alarm sounds" : "Browsers need one click before sound can play"}
              className={`rounded border px-3 py-1 text-sm ${
                sound.muted ? "border-slate-700 text-slate-500" : "border-slate-600 text-slate-200"
              } hover:bg-slate-800`}
            >
              {sound.muted ? "🔇 Muted" : sound.ready ? "🔊 Sound on" : "🔈 Click to enable sound"}
            </button>
            <button
              type="button"
              onClick={() => setModal("qr")}
              className="rounded border border-teal-600 px-3 py-1 text-sm font-semibold text-teal-300 hover:bg-teal-600/20"
            >
              QR · Join
            </button>
            <button
              type="button"
              onClick={() => setModal("reset")}
              className="rounded border border-slate-700 px-3 py-1 text-sm text-slate-300 hover:bg-slate-800"
            >
              Reset demo
            </button>
          </>
        }
      />

      <div
        className={`grid min-h-0 flex-1 gap-3 p-3 ${
          showPresenter ? "grid-cols-[minmax(0,1fr)_400px_340px]" : "grid-cols-[minmax(0,1fr)_400px]"
        }`}
      >
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

        {showPresenter && <PresenterPanel residents={residents} />}
      </div>

      {modal === "qr" && <QrModal onClose={closeModal} />}
      {modal === "reset" && <ResetModal onClose={closeModal} onDone={refresh} />}

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
