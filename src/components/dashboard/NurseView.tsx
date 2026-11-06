"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import type { Alert, Nurse, Resident, StateResponse } from "@/lib/types";
import AlertQueue from "./AlertQueue";
import ConnectionBanner from "./ConnectionBanner";
import Header from "./Header";
import ResidentDrawer from "./ResidentDrawer";
import ResidentTile from "./ResidentTile";
import { useAlarmSounds } from "./useAlarmSounds";
import { useDemoShortcuts } from "./useDemoShortcuts";
import { useEscalation } from "./useEscalation";
import { useHeartRateDrift } from "./useHeartRateDrift";
import { ALERT_LABEL, patchAlert, topAlertFor, useNow } from "./util";
import { useCurrentNurse, useViewShortcut } from "./views";

const fetcher = async (url: string): Promise<StateResponse> => {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
};

/** /nurse/[id] — one nurse's residents and alert queue only, plus a strip for other nurses' open P1s. */
export default function NurseView({ nurseId, logoSrc }: { nurseId: string; logoSrc: string | null }) {
  useViewShortcut("nurse");
  const router = useRouter();
  const [remembered, setRemembered] = useCurrentNurse();

  const [skew, setSkew] = useState(0);
  const [lastOkAt, setLastOkAt] = useState<number | null>(null);
  const { track, displayHr } = useHeartRateDrift();
  // On errors SWR keeps the last good `data`: residents and queue stay on screen under the banner.
  const { data, error, mutate } = useSWR<StateResponse>("/api/state", fetcher, {
    refreshInterval: 1000,
    onSuccess: (d) => {
      setLastOkAt(Date.now());
      setSkew(d.serverTime - Date.now());
      track(d.residents);
    },
  });
  const clientNow = useNow(500);
  const now = clientNow == null ? null : clientNow + skew;
  const refresh = useCallback(() => void mutate(), [mutate]);

  const nurse = data?.nurses.find((n) => n.id === nurseId);
  const residents = useMemo(
    () => (data?.residents ?? []).filter((r) => r.assignedNurseId === nurseId),
    [data, nurseId],
  );
  const myAlerts = useMemo(
    () => (data ? data.alerts.filter((a) => a.assignedNurseId === nurseId) : undefined),
    [data, nurseId],
  );
  const allAlerts = data?.alerts ?? [];

  // This tab now belongs to this nurse (so "Nurse view" / V come back here).
  useEffect(() => {
    if (nurse && nurse.role !== "Charge" && remembered !== nurseId) setRemembered(nurseId);
  }, [nurse, nurseId, remembered, setRemembered]);

  useEscalation(allAlerts, now, refresh); // server prevents double escalation across tabs
  useDemoShortcuts(residents, allAlerts); // 1/2/3 → this nurse's residents only
  const sound = useAlarmSounds(myAlerts); // her alerts only

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const closeDrawer = useCallback(() => setSelectedId(null), []);
  const selected = selectedId ? residents.find((r) => r.id === selectedId) : undefined;
  const heartRateOf = useCallback((r: Resident) => displayHr(r, clientNow), [displayHr, clientNow]);

  const switchNurse = () => {
    setRemembered("");
    router.push("/nurse");
  };

  const live = error ? "offline" : data ? "live" : "connecting";

  if (data && (!nurse || nurse.role === "Charge")) {
    return (
      <div className="flex h-screen flex-col bg-[#070b14] text-slate-100">
        <Header logoSrc={logoSrc} view="nurse" live={live} />
        <main className="flex flex-1 flex-col items-center justify-center gap-4">
          <p className="text-lg text-slate-300">
            {nurse ? `${nurse.name} uses the Charge view.` : "Unknown nurse."}
          </p>
          <div className="flex gap-3">
            {nurse && (
              <Link href="/dashboard" className="rounded bg-teal-500 px-4 py-2 font-semibold text-slate-950">
                Open Charge view
              </Link>
            )}
            <button type="button" onClick={switchNurse} className="rounded border border-slate-600 px-4 py-2 text-slate-200">
              Pick a nurse
            </button>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-[#070b14] text-slate-100 lg:h-screen">
      <Header
        logoSrc={logoSrc}
        view="nurse"
        live={live}
        info={
          nurse && (
            <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="text-lg font-semibold text-white">
                {nurse.name} <span className="font-normal text-slate-400">· {nurse.role} · {nurse.wing} · {residents.length} residents</span>
              </span>
              <button
                type="button"
                onClick={switchNurse}
                className="text-xs text-slate-400 underline-offset-4 hover:text-white hover:underline"
              >
                Switch nurse
              </button>
            </span>
          )
        }
        actions={
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
        }
      />

      <ConnectionBanner offline={!!error} lastOkAt={lastOkAt} now={clientNow} />

      {data && nurse && (
        <TeamEmergencies nurse={nurse} alerts={allAlerts} residents={data.residents} onChanged={refresh} />
      )}

      {/* Phone/tablet: queue on top, tiles (2 columns) below, page scrolls. lg+: tiles | 460px queue. */}
      <div className="flex flex-1 flex-col gap-3 p-3 lg:grid lg:min-h-0 lg:grid-cols-[minmax(0,1fr)_460px]">
        <div className="order-2 grid auto-rows-min grid-cols-2 gap-3 lg:order-none lg:min-h-0 lg:overflow-y-auto lg:pr-1 xl:grid-cols-4">
          {data && nurse && residents.length === 0 && (
            <div className="col-span-full flex flex-col items-center gap-2 rounded-xl border border-dashed border-slate-700 px-6 py-12 text-center">
              <p className="text-lg font-semibold text-slate-200">No residents assigned to {nurse.name} tonight</p>
              <p className="text-sm text-slate-400">
                Residents appear here as soon as they are assigned. Team emergencies still show above.
              </p>
            </div>
          )}
          {residents.map((r) => (
            <ResidentTile
              key={r.id}
              size="lg"
              resident={r}
              heartRate={heartRateOf(r)}
              alert={topAlertFor(myAlerts ?? [], r.id)}
              onSelect={setSelectedId}
            />
          ))}
        </div>

        <div className="order-1 flex flex-col lg:order-none lg:min-h-0">
        <AlertQueue
          alerts={myAlerts ?? []}
          residents={data?.residents ?? []}
          nurses={data?.nurses ?? []}
          now={now}
          onChanged={refresh}
          onSelectResident={(id) => residents.some((r) => r.id === id) && setSelectedId(id)}
          actingNurseId={nurseId}
          loading={!data}
          residentCount={residents.length}
        />
        </div>
      </div>

      {selected && (
        <ResidentDrawer
          resident={selected}
          heartRate={heartRateOf(selected)}
          nurses={data?.nurses ?? []}
          alerts={allAlerts}
          now={now}
          onClose={closeDrawer}
        />
      )}
    </div>
  );
}

/** Thin red strip(s): another nurse's resident has an OPEN P1. Only cross-nurse info shown here. */
function TeamEmergencies({
  nurse,
  alerts,
  residents,
  onChanged,
}: {
  nurse: Nurse;
  alerts: Alert[];
  residents: Resident[];
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const byId = new Map(residents.map((r) => [r.id, r]));
  const team = alerts
    .filter((a) => a.priority === 1 && a.status === "open" && a.assignedNurseId !== nurse.id)
    .sort((a, b) => a.createdAt - b.createdAt);
  if (team.length === 0) return null;

  return (
    // Sticky so it stays visible while the page scrolls on a phone.
    <div className="sticky top-0 z-30 flex flex-col">
      {team.map((a) => {
        const r = byId.get(a.residentId);
        const assisting = (a.assistingNurseIds ?? []).includes(nurse.id);
        return (
          <div key={a.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-red-900 bg-red-600 px-3 py-1.5 text-sm text-white sm:px-5 lg:bg-red-600/90">
            <span className="kijo-flash-fast font-bold">●</span>
            <span className="font-semibold">Team emergency</span>
            <span>
              · Room {r?.room ?? "?"} · {r?.name ?? "Unknown"} · {ALERT_LABEL[a.type]}
            </span>
            <span className="ml-auto">
              {assisting ? (
                <span className="rounded bg-white/20 px-3 py-0.5 text-xs font-semibold">Assisting ✓</span>
              ) : (
                <button
                  type="button"
                  disabled={busy === a.id}
                  onClick={async () => {
                    setBusy(a.id);
                    try {
                      await patchAlert(a.id, { action: "assist", nurseId: nurse.id });
                      onChanged();
                    } catch (err) {
                      console.warn("Assist failed:", err);
                    } finally {
                      setBusy(null);
                    }
                  }}
                  className="min-h-12 rounded bg-white px-5 text-sm font-bold text-red-700 hover:bg-red-50 disabled:opacity-60 lg:min-h-0 lg:px-3 lg:py-0.5 lg:text-xs"
                >
                  {busy === a.id ? "…" : "Assist"}
                </button>
              )}
            </span>
          </div>
        );
      })}
    </div>
  );
}
