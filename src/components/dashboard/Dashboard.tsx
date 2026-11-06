"use client";


import { useCallback, useState } from "react";
import useSWR from "swr";
import type { Resident, StateResponse } from "@/lib/types";
import AlertQueue from "./AlertQueue";
import { ArrowCounterClockwise, Broom, ChartBar, Plus, QrCode } from "@phosphor-icons/react";
import Header, { HeaderButton } from "./Header";
import { NurseBadge, NursePod } from "./NursePod";
import NightReportModal from "./NightReportModal";
import { AddPatientModal, ClearGuestsModal, MovePatientModal, RemovePatientModal } from "./PatientAdminModals";
import type { PatientAction } from "./PatientMenu";
import NurseBar from "./NurseBar";
import QrModal from "./QrModal";
import ResetModal from "./ResetModal";
import SoundToggle from "./SoundToggle";
import { useAlarmSounds } from "./useAlarmSounds";
import ResidentDrawer from "./ResidentDrawer";
import { AutopilotPill, useAutopilot } from "./useAutopilot";
import ConnectionBanner from "./ConnectionBanner";
import { useDemoShortcuts } from "./useDemoShortcuts";
import { useEscalation } from "./useEscalation";
import { useHeartRateDrift } from "./useHeartRateDrift";
import { useNow } from "./util";
import { useViewShortcut } from "./views";

const fetcher = async (url: string): Promise<StateResponse> => {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
};

export default function Dashboard({ logoSrc }: { logoSrc: string | null }) {
  const [skew, setSkew] = useState(0); // serverTime - clientTime, so timers match the DB clock
  const [lastOkAt, setLastOkAt] = useState<number | null>(null);
  const { track, displayHr } = useHeartRateDrift();
  // On errors SWR keeps the last good `data`, so the floor stays on screen under the banner.
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

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [modal, setModal] = useState<"qr" | "reset" | "report" | "add" | "clear" | null>(null);
  const closeModal = useCallback(() => setModal(null), []);
  const [manage, setManage] = useState<{ id: string; action: PatientAction } | null>(null);
  const closeManage = useCallback(() => setManage(null), []);
  const onManage = useCallback((r: Resident, action: PatientAction) => setManage({ id: r.id, action }), []);

  useViewShortcut("charge");
  const refresh = useCallback(() => void mutate(), [mutate]);
  const closeDrawer = useCallback(() => setSelectedId(null), []);

  const residents = data?.residents ?? [];
  const nurses = data?.nurses ?? [];
  const alerts = data?.alerts ?? [];
  useEscalation(alerts, now, refresh);
  useDemoShortcuts(residents, alerts);
  const autopilot = useAutopilot(alerts); // hidden: Shift+A start, Esc stop
  const sound = useAlarmSounds(data?.alerts);
  const heartRateOf = useCallback((r: Resident) => displayHr(r, clientNow), [displayHr, clientNow]);

  const selected = selectedId ? residents.find((r) => r.id === selectedId) : undefined;

  const podNurses = nurses.filter((n) => residents.some((r) => r.assignedNurseId === n.id));
  const badgeNurses = nurses.filter((n) => !podNurses.includes(n));

  const openCount = alerts.filter((a) => a.status === "open").length;
  const guestCount = residents.filter((r) => r.isGuest).length;
  const managed = manage ? residents.find((r) => r.id === manage.id) : undefined;

  return (
    <div className="flex min-h-screen flex-col bg-bg text-ink lg:h-screen">
      <Header
        logoSrc={logoSrc}
        view="charge"
        info={
          <span className="flex items-center gap-4 text-sm text-muted">
            <span>
              Nurses on <span className="num text-ink">{nurses.length}</span>
            </span>
            <span>
              Open alerts <span className="num text-ink">{openCount}</span>
            </span>
          </span>
        }
        live={error ? "offline" : data ? "live" : "connecting"}
        actions={
          <>
            <SoundToggle sound={sound} />
            <HeaderButton icon={<ChartBar size={18} aria-hidden />} label="Night report" onClick={() => setModal("report")} />
            <HeaderButton icon={<QrCode size={18} aria-hidden />} label="Join QR code" onClick={() => setModal("qr")} />
            <HeaderButton
              icon={<ArrowCounterClockwise size={18} aria-hidden />}
              label="Reset demo"
              onClick={() => setModal("reset")}
            />
          </>
        }
      />
      <ConnectionBanner offline={!!error} lastOkAt={lastOkAt} now={clientNow} />

      {/* Phone/tablet: queue first, pods below, page scrolls. lg+: pods | 460px queue. */}
      <div className="flex flex-1 flex-col gap-4 p-4 lg:grid lg:min-h-0 lg:grid-cols-[minmax(0,1fr)_460px]">
        <div className="order-2 flex flex-col gap-2 lg:order-none lg:min-h-0 lg:overflow-y-auto lg:pr-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="label-caps mr-auto">Residents · {residents.length}</span>
            <AdminButton icon={<Plus size={18} aria-hidden />} label="Add resident" onClick={() => setModal("add")} />
            <AdminButton
              icon={<Broom size={18} aria-hidden />}
              label={`Clear joined residents (${guestCount})`}
              onClick={() => setModal("clear")}
              disabled={guestCount === 0}
            />
          </div>
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
              onManage={onManage}
            />
          ))}
        </div>

        <div className="order-1 flex flex-col lg:order-none lg:min-h-0">
          <AlertQueue
            alerts={alerts}
            residents={residents}
            nurses={nurses}
            now={now}
            onChanged={refresh}
            onSelectResident={setSelectedId}
            loading={!data}
            residentCount={residents.length}
          />
        </div>
      </div>

      <div className="hidden lg:block">
        <NurseBar nurses={nurses} alerts={alerts} />
      </div>

      {modal === "report" && <NightReportModal onClose={closeModal} />}
      {modal === "qr" && <QrModal onClose={closeModal} />}
      {modal === "reset" && <ResetModal onClose={closeModal} onDone={refresh} />}
      {modal === "add" && <AddPatientModal nurses={nurses} onClose={closeModal} onDone={refresh} />}
      {modal === "clear" && <ClearGuestsModal count={guestCount} onClose={closeModal} onDone={refresh} />}
      {managed && manage?.action === "move" && (
        <MovePatientModal resident={managed} nurses={nurses} onClose={closeManage} onDone={refresh} />
      )}
      {managed && manage?.action === "remove" && (
        <RemovePatientModal
          resident={managed}
          openAlerts={alerts.filter((a) => a.residentId === managed.id).length}
          onClose={closeManage}
          onDone={refresh}
        />
      )}

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

      <AutopilotPill status={autopilot.status} />
    </div>
  );
}

function AdminButton({
  icon,
  label,
  onClick,
  disabled,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex h-9 items-center gap-2 rounded-btn border border-line-2 px-3 text-sm font-medium text-ink transition-colors hover:bg-surface-2 disabled:opacity-50 disabled:hover:bg-transparent"
    >
      {icon}
      {label}
    </button>
  );
}
