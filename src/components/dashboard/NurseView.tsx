"use client";

import { Bed, Check, Siren, UserCircle } from "@phosphor-icons/react";
import { Avatar } from "./NursePod";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import type { Alert, Nurse, Resident, StateResponse } from "@/lib/types";
import { MAIN_NURSE_ID } from "@/lib/demoConfig";
import AlertQueue from "./AlertQueue";
import LivePatients from "./LivePatients";
import ConnectionBanner from "./ConnectionBanner";
import Header from "./Header";
import ResidentDrawer from "./ResidentDrawer";
import ResidentTile from "./ResidentTile";
import SoundToggle from "./SoundToggle";
import { useAlarmSounds } from "./useAlarmSounds";
import { useDemoShortcuts } from "./useDemoShortcuts";
import { useEscalation } from "./useEscalation";
import { useHeartRateDrift } from "./useHeartRateDrift";
import { ALERT_LABEL, patchAlert, residentTitle, topAlertFor, useNow } from "./util";
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
  const teamAlerts = useMemo(
    () => (data ? data.alerts.filter((a) => a.assignedNurseId !== nurseId) : undefined),
    [data, nurseId],
  );
  // Her own P1s ring until acknowledged; another nurse's new P1 plays one soft tone.
  const sound = useAlarmSounds(myAlerts, teamAlerts);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const closeDrawer = useCallback(() => setSelectedId(null), []);
  const selected = selectedId ? residents.find((r) => r.id === selectedId) : undefined;
  const heartRateOf = useCallback((r: Resident) => displayHr(r, clientNow), [displayHr, clientNow]);

  const switchNurse = () => {
    setRemembered("");
    router.push("/nurse/switch");
  };

  const live = error ? "offline" : data ? "live" : "connecting";
  const isMain = nurseId === MAIN_NURSE_ID; // main nurse: Live patients on top, demo residents collapsed

  if (data && (!nurse || nurse.role === "Charge")) {
    return (
      <div className="flex h-screen flex-col bg-bg text-ink">
        <Header logoSrc={logoSrc} view="nurse" live={live} />
        <main className="flex flex-1 flex-col items-center justify-center gap-4 p-4 text-center">
          <UserCircle size={40} className="text-muted" aria-hidden />
          <p className="text-xl text-ink">{nurse ? `${nurse.name} uses the Charge view.` : "Unknown nurse."}</p>
          <div className="flex gap-2">
            {nurse && (
              <Link
                href="/dashboard"
                className="inline-flex h-10 items-center rounded-btn bg-brand px-4 font-semibold text-on-brand hover:bg-brand-hover"
              >
                Open Charge view
              </Link>
            )}
            <button
              type="button"
              onClick={switchNurse}
              className="inline-flex h-10 items-center rounded-btn border border-line-2 px-4 text-ink hover:bg-surface-2"
            >
              Pick a nurse
            </button>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-bg text-ink lg:h-screen">
      <Header
        logoSrc={logoSrc}
        view="nurse"
        live={live}
        info={
          nurse && (
            <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="flex items-center gap-2">
                <Avatar name={nurse.name} />
                <span className="text-base font-semibold text-ink">{nurse.name}</span>
              </span>
              <span className="text-sm text-muted">
                {nurse.role} · {nurse.wing} · <span className="num">{residents.length}</span> residents
              </span>
              <button
                type="button"
                onClick={switchNurse}
                className="rounded text-xs text-muted underline-offset-4 hover:text-ink hover:underline"
              >
                Switch nurse
              </button>
            </span>
          )
        }
        actions={
          <SoundToggle sound={sound} />
        }
      />

      <ConnectionBanner offline={!!error} lastOkAt={lastOkAt} now={clientNow} />

      {data && nurse && (
        <TeamEmergencies nurse={nurse} alerts={allAlerts} residents={data.residents} onChanged={refresh} />
      )}

      {/* Phone/tablet: queue on top, tiles (2 columns) below, page scrolls. lg+: tiles | 460px queue. */}
      <div className="flex flex-1 flex-col gap-4 p-4 lg:grid lg:min-h-0 lg:grid-cols-[minmax(0,1fr)_460px]">
        {isMain ? (
          <div className="order-2 lg:order-none lg:min-h-0 lg:overflow-y-auto lg:pr-1">
            <LivePatients
              residents={residents}
              alerts={myAlerts ?? []}
              heartRateOf={heartRateOf}
              onSelect={setSelectedId}
            />
          </div>
        ) : (
          <div className="order-2 grid auto-rows-min grid-cols-2 gap-2 lg:order-none lg:min-h-0 lg:overflow-y-auto lg:pr-1 xl:grid-cols-4">
            {data && nurse && residents.length === 0 && (
              <div className="col-span-full flex flex-col items-center gap-2 rounded-card border border-dashed border-line-2 px-6 py-12 text-center">
                <Bed size={40} className="text-muted" aria-hidden />
                <p className="text-xl font-semibold text-ink">No residents assigned to {nurse.name} tonight</p>
                <p className="text-sm text-muted">
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
        )}

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

/** Alarm strip(s): another nurse's resident has an OPEN P1. Only cross-nurse info shown here. */
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
          <div
            key={a.id}
            className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-alarm/40 bg-tint-p1 px-4 py-2 text-sm text-ink"
          >
            <Siren size={18} weight="bold" className="kijo-flash-fast text-alarm" aria-hidden />
            <span className="font-semibold">Team emergency</span>
            <span className="text-ink/90">
              {residentTitle(r)} · {ALERT_LABEL[a.type]}
            </span>
            <span className="ml-auto shrink-0">
              {assisting ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-line-2 px-3 py-0.5 text-xs font-medium">
                  Assisting <Check size={14} weight="bold" aria-hidden />
                </span>
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
                  className="inline-flex h-11 items-center rounded-btn bg-brand px-4 text-sm font-semibold text-on-brand hover:bg-brand-hover disabled:opacity-60 lg:h-8 lg:px-3"
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
