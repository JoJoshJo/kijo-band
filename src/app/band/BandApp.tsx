"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import useSWR from "swr";
import type { Alert, Language, Nurse, Resident, StateResponse } from "@/lib/types";
import {
  ALERT_RATE_LIMIT_MS,
  HR_HIGH,
  HR_LOW,
  VITALS_SUSTAIN_MS,
  type AlertSource,
  type BandAlertType,
  residentSaysOk,
} from "@/lib/detection/alertRules";
import { LANGUAGES, STRINGS, fill, nurseDisplayName, type BandStrings } from "./_lib/i18n";
import { useMotionDetection } from "./_lib/useMotionDetection";
import { useVoiceTrigger } from "./_lib/useVoiceTrigger";
import { promptInstall, useBandPwa, useInstallKind, useStoredResidentId } from "./_lib/pwa";

const POLL_MS = 1000;
const HEARTBEAT_MS = 2000;
const FALL_CANCEL_S = 10;
const ETA_MS = 2 * 60_000;

const fetcher = async (url: string): Promise<StateResponse> => {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
};

export default function BandApp() {
  const params = useSearchParams();
  const embedded = params.get("embedded") === "1";
  // Opened from the home screen without ?resident= (older install): fall back to the resident saved on this phone.
  const storedResidentId = useStoredResidentId();
  const residentId = params.get("resident") ?? (embedded ? null : storedResidentId);

  if (!residentId) return <CenterMessage text={STRINGS.en.missingResident} />;
  return <Band key={residentId} residentId={residentId} embedded={embedded} />;
}

/** "Add to Home Screen" hint on the Start screen; hidden once installed and on desktop browsers. */
function InstallHint({ t }: { t: BandStrings }) {
  const kind = useInstallKind();
  if (kind !== "ios" && kind !== "prompt") return null;
  return (
    <div className="w-full max-w-sm rounded-2xl border border-slate-700 bg-slate-900 p-4 text-center">
      <div className="text-lg font-semibold">{t.installTitle}</div>
      {kind === "ios" ? (
        <div className="mt-1 text-base text-slate-300">{t.installIos}</div>
      ) : (
        <button
          onClick={() => void promptInstall()}
          className="mt-3 rounded-full bg-white px-5 py-2 text-lg font-semibold text-black active:scale-95"
        >
          {t.installButton}
        </button>
      )}
    </div>
  );
}

function CenterMessage({ text }: { text: string }) {
  return <div className="flex flex-1 items-center justify-center p-8 text-center text-2xl text-slate-300">{text}</div>;
}

/**
 * The alert the band should show: the most urgent one (then oldest). Within the same priority an
 * acknowledged alert wins, so "on the way" isn't hidden by a duplicate open alert of equal urgency.
 */
function pickActiveAlert(alerts: Alert[], residentId: string): Alert | undefined {
  const ackFirst = (a: Alert) => (a.status === "acknowledged" ? 0 : 1);
  return alerts
    .filter((a) => a.residentId === residentId && a.status !== "resolved")
    .sort((a, b) => a.priority - b.priority || ackFirst(a) - ackFirst(b) || a.createdAt - b.createdAt)[0];
}

function clamp(n: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, n));
}

function Band({ residentId, embedded }: { residentId: string; embedded: boolean }) {
  // Server clock offset so the ETA countdown isn't thrown off by a phone's clock.
  const [clockOffset, setClockOffset] = useState(0);
  const { data, error, mutate } = useSWR<StateResponse>("/api/state", fetcher, {
    refreshInterval: POLL_MS,
    onSuccess: (d) => setClockOffset(d.serverTime - Date.now()),
  });
  const resident = data?.residents.find((r) => r.id === residentId);

  const [langOverride, setLangOverride] = useState<Language | null>(null);
  const lang: Language = langOverride ?? resident?.language ?? "en";
  const t = STRINGS[lang];

  // Embedded (dashboard phone frame) skips the Start screen: no motion/wake-lock permission is needed in an iframe.
  const [started, setStarted] = useState(embedded);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

  const [now, setNow] = useState(() => Date.now());

  useBandPwa(residentId, !embedded);

  // ── Simulated heart rate (spec: resting 62–80 with small noise) ──
  const [hr, setHr] = useState<number | null>(null);
  const [hrOverride, setHrOverride] = useState<number | null>(null); // embedded slider
  const baseHrRef = useRef<number | null>(null);
  const hrOverrideRef = useRef<number | null>(null);
  useEffect(() => {
    hrOverrideRef.current = hrOverride;
  }, [hrOverride]);
  useEffect(() => {
    if (resident && baseHrRef.current == null) baseHrRef.current = clamp(resident.heartRate, 62, 80);
  }, [resident]);

  useEffect(() => {
    const id = setInterval(() => {
      setNow(Date.now());
      const base = baseHrRef.current;
      if (base == null) return;
      setHr((prev) => {
        const target = hrOverrideRef.current ?? base;
        const noise = (Math.random() - 0.5) * 3;
        const next = prev == null ? target : prev + (target - prev) * 0.35 + noise;
        // Drift the resting baseline slightly so it never looks frozen.
        if (hrOverrideRef.current == null) baseHrRef.current = clamp(base + (Math.random() - 0.5), 62, 80);
        return Math.round(clamp(next, 30, 200));
      });
    }, 1000);
    return () => clearInterval(id);
  }, []);

  // ── Sending alerts ──
  const [sending, setSending] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const lastSentRef = useRef(0);
  const hrRef = useRef<number | null>(null);
  useEffect(() => {
    hrRef.current = hr;
  }, [hr]);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast((cur) => (cur === msg ? null : cur)), 3000);
  }, []);

  // "Back" hides the overlay for this alert only (it stays open); a newer alert shows the overlay again.
  const [hiddenAlertId, setHiddenAlertId] = useState<string | null>(null);

  /** "I'm OK – cancel": P2/P3 are resolved; a P1 is only flagged "resident says OK" (a nurse still checks). */
  const cancelAlert = useCallback(
    async (alertId: string): Promise<boolean> => {
      try {
        const res = await fetch(`/api/alert/${encodeURIComponent(alertId)}/cancel`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ residentId }),
        });
        if (!res.ok) {
          showToast(STRINGS[lang].cancelFailed);
          return false;
        }
        const body = (await res.json().catch(() => ({}))) as { result?: string };
        if (body.result === "cancelled") showToast(STRINGS[lang].requestCancelled);
        await mutate();
        return true;
      } catch {
        showToast(STRINGS[lang].cancelFailed);
        return false;
      }
    },
    [lang, mutate, residentId, showToast],
  );

  /** POST to /api/alert or /api/triage with the shared 10s client-side limit and error toasts. */
  const postAlert = useCallback(
    async (url: "/api/alert" | "/api/triage", body: Record<string, unknown>) => {
      if (Date.now() - lastSentRef.current < ALERT_RATE_LIMIT_MS) {
        showToast(STRINGS[lang].waitMoment);
        return;
      }
      lastSentRef.current = Date.now();
      setSending(true);
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ residentId, heartRate: hrRef.current ?? undefined, ...body }),
        });
        if (res.status === 429) showToast(STRINGS[lang].waitMoment);
        else if (!res.ok) {
          lastSentRef.current = 0; // let them retry right away
          showToast(STRINGS[lang].sendFailed);
        }
        await mutate();
      } catch {
        lastSentRef.current = 0;
        showToast(STRINGS[lang].sendFailed);
      } finally {
        setSending(false);
      }
    },
    [lang, mutate, residentId, showToast],
  );
  const sendAlert = useCallback(
    (type: BandAlertType, source?: AlertSource) => postAlert("/api/alert", { type, source }),
    [postAlert],
  );

  // ── Real motion detection (phone only; the embedded frame uses the simulate buttons) ──
  const fallPendingRef = useRef(false);
  const startFallRef = useRef<(source: AlertSource) => void>(() => {});
  const motion = useMotionDetection(started && !embedded, (e) => {
    if (fallPendingRef.current) return; // already asking "Are you OK?"
    if (e.type === "fall") {
      startFallRef.current("detector");
    } else {
      lastSentRef.current = 0; // a deliberate SOS shake must not be swallowed by the client-side limit
      void sendAlert("sos_shake", "detector");
    }
  });

  // ── Heartbeat: write HR (and whether the resident moved) to the DB every 2s ──
  useEffect(() => {
    if (!started) return;
    const id = setInterval(() => {
      const heartRate = hrRef.current;
      if (heartRate == null || document.visibilityState !== "visible") return;
      void fetch("/api/heartbeat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ residentId, heartRate: Math.round(clamp(heartRate, 20, 250)), moved: motion.takeMoved() }),
      }).catch(() => {});
    }, HEARTBEAT_MS);
    return () => clearInterval(id);
  }, [started, residentId, motion]);

  // ── Vitals: HR > 130 or < 45 for 10s → P1 vitals alert (once per excursion) ──
  const outOfRangeSinceRef = useRef<number | null>(null);
  const vitalsFiredRef = useRef(false);
  useEffect(() => {
    if (!started || hr == null) return;
    if (hr > HR_HIGH || hr < HR_LOW) {
      const since = (outOfRangeSinceRef.current ??= Date.now());
      if (!vitalsFiredRef.current && Date.now() - since >= VITALS_SUSTAIN_MS) {
        vitalsFiredRef.current = true;
        void sendAlert("vitals", hrOverrideRef.current != null ? "simulated" : "detector");
      }
    } else {
      outOfRangeSinceRef.current = null;
      vitalsFiredRef.current = false;
    }
  }, [hr, started, sendAlert]);

  // ── Fall "Are you OK?" countdown (from the motion detector or the embedded "Simulate fall") ──
  const [fallDeadline, setFallDeadline] = useState<number | null>(null);
  const fallSourceRef = useRef<AlertSource>("simulated");
  const startFallCountdown = useCallback((source: AlertSource) => {
    fallSourceRef.current = source;
    setFallDeadline(Date.now() + FALL_CANCEL_S * 1000);
  }, []);
  const fallSecondsLeft = fallDeadline == null ? null : Math.max(0, Math.ceil((fallDeadline - now) / 1000));
  useEffect(() => {
    if (fallDeadline == null) return;
    const ms = Math.max(0, fallDeadline - Date.now());
    const id = setTimeout(() => {
      setFallDeadline(null);
      lastSentRef.current = 0; // a confirmed fall must never be swallowed by the client-side limit
      void sendAlert("fall", fallSourceRef.current);
    }, ms);
    return () => clearTimeout(id);
  }, [fallDeadline, sendAlert]);

  useEffect(() => {
    fallPendingRef.current = fallDeadline != null;
    startFallRef.current = startFallCountdown;
  }, [fallDeadline, startFallCountdown]);

  // ── Voice: continuous listening; only the sentence with a trigger word goes to /api/triage ──
  const voice = useVoiceTrigger({
    enabled: started && !!resident?.canSpeak,
    lang,
    onTrigger: (sentence) => void postAlert("/api/triage", { transcript: sentence, language: lang }),
  });

  // ── Start Kijo (permissions must be requested inside the tap) ──
  const requestWakeLock = useCallback(async () => {
    try {
      if ("wakeLock" in navigator && document.visibilityState === "visible") {
        wakeLockRef.current = await navigator.wakeLock.request("screen");
      }
    } catch {
      // Not supported / denied (e.g. low battery): the band still works.
    }
  }, []);

  const handleStart = useCallback(async () => {
    // iOS: must be the first await inside the user gesture.
    const DME = typeof DeviceMotionEvent !== "undefined"
      ? (DeviceMotionEvent as unknown as { requestPermission?: () => Promise<PermissionState> })
      : undefined;
    try {
      if (DME?.requestPermission) await DME.requestPermission();
    } catch {
      // Denied or not in a gesture; motion detection (Checkpoint 3) will be unavailable.
    }
    if (resident?.canSpeak && navigator.mediaDevices?.getUserMedia) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach((tr) => tr.stop()); // permission only; nothing is recorded
      } catch {
        // Mic denied: buttons still work.
      }
    }
    await requestWakeLock();
    setStarted(true);
  }, [resident?.canSpeak, requestWakeLock]);

  useEffect(() => {
    if (!started) return;
    const onVisible = () => {
      if (document.visibilityState === "visible") void requestWakeLock();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      void wakeLockRef.current?.release().catch(() => {});
      wakeLockRef.current = null;
    };
  }, [started, requestWakeLock]);

  // ── Render ──
  if (!data) return <CenterMessage text={error ? t.offline : t.loading} />;
  if (!resident) return <CenterMessage text={t.notFound} />;

  const activeAlert = pickActiveAlert(data.alerts, residentId);
  const nurse = activeAlert ? data.nurses.find((n) => n.id === activeAlert.assignedNurseId) : undefined;

  if (!started) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-8 p-6 text-center">
        <div>
          <div className="text-3xl font-semibold">{resident.name}</div>
          <div className="mt-1 text-xl text-slate-400">
            {t.room} {resident.room}
          </div>
        </div>
        <button
          onClick={handleStart}
          className="flex aspect-square w-[70vw] max-w-80 items-center justify-center rounded-full bg-teal-500 text-4xl font-bold text-black shadow-[0_0_60px_rgba(20,184,166,0.5)] active:scale-95"
        >
          {t.start}
        </button>
        <div className="text-xl text-slate-400">{t.startHint}</div>
        <LanguageSwitch lang={lang} onChange={setLangOverride} />
        <InstallHint t={t} />
      </div>
    );
  }

  return (
    <>
      <div className="relative flex flex-1 flex-col gap-5 p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
        <style>{`@keyframes kijo-beat{0%,100%{transform:scale(1)}15%{transform:scale(1.25)}30%{transform:scale(1)}}`}</style>

        {activeAlert && activeAlert.id === hiddenAlertId && fallSecondsLeft == null && (
          <HelpBanner
            t={t}
            lang={lang}
            alert={activeAlert}
            nurse={nurse}
            serverNow={now + clockOffset}
            onOpen={() => setHiddenAlertId(null)}
          />
        )}

        {/* Header: name, room, status, live HR */}
        <header className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <StatusDot status={resident.status} />
              <span className="truncate text-2xl font-semibold">{resident.name}</span>
            </div>
            <div className="mt-0.5 text-lg text-slate-400">
              {t.room} {resident.room}
            </div>
          </div>
          <div className="flex items-center gap-2 text-right" aria-live="off">
            <span
              className="inline-block text-3xl text-red-500"
              style={hr ? { animation: `kijo-beat ${(60 / hr).toFixed(2)}s ease-in-out infinite` } : undefined}
              aria-hidden
            >
              ♥
            </span>
            <span className="text-4xl font-bold tabular-nums">{hr ?? "--"}</span>
            <span className="text-base text-slate-400">{t.bpm}</span>
          </div>
        </header>

        {/* Giant HELP */}
        <div className="flex flex-1 items-center justify-center py-2">
          <button
            onClick={() => void sendAlert("need_help", "big_help")}
            disabled={sending}
            className="flex aspect-square w-[68vw] max-w-72 items-center justify-center rounded-full bg-red-600 text-6xl font-black tracking-wide shadow-[0_0_70px_rgba(220,38,38,0.55)] active:scale-95 disabled:opacity-60"
          >
            {t.help}
          </button>
        </div>

        {/* Need buttons */}
        <div className="grid grid-cols-2 gap-4">
          <NeedButton emoji="😣" label={t.pain} disabled={sending} onClick={() => void sendAlert("need_pain")} />
          <NeedButton emoji="🚻" label={t.bathroom} disabled={sending} onClick={() => void sendAlert("need_bathroom")} />
          <NeedButton emoji="💧" label={t.water} disabled={sending} onClick={() => void sendAlert("need_water")} />
          <NeedButton
            emoji="🙋"
            label={t.needHelp}
            disabled={sending}
            onClick={() => void sendAlert("need_help", "need_button")}
          />
        </div>

        <div className="min-h-7 text-center text-lg text-slate-300" aria-live="polite">
          {sending ? t.sending : toast ?? (error ? t.offline : "")}
        </div>

        {voice.listening && (
          <div className="flex items-center justify-center gap-2 text-lg text-teal-300" aria-live="polite">
            <span className="inline-block h-2.5 w-2.5 animate-pulse rounded-full bg-teal-400" aria-hidden />
            🎙️ {t.listening}
          </div>
        )}

        <LanguageSwitch lang={lang} onChange={setLangOverride} />

        {fallSecondsLeft != null && (
          <FallCountdown t={t} secondsLeft={fallSecondsLeft} onCancel={() => setFallDeadline(null)} />
        )}
        {activeAlert && activeAlert.id !== hiddenAlertId && fallSecondsLeft == null && (
          <HelpOverlay
            key={activeAlert.id}
            t={t}
            lang={lang}
            alert={activeAlert}
            nurse={nurse}
            serverNow={now + clockOffset}
            onBack={() => setHiddenAlertId(activeAlert.id)}
            onCancel={() => cancelAlert(activeAlert.id)}
          />
        )}
      </div>

      {embedded && (
        <DemoControls
          hr={hr}
          hrOverride={hrOverride}
          onHrOverride={setHrOverride}
          onFall={() => startFallCountdown("simulated")}
          onShake={() => {
            lastSentRef.current = 0;
            void sendAlert("sos_shake", "simulated");
          }}
        />
      )}
    </>
  );
}

function StatusDot({ status }: { status: Resident["status"] }) {
  const color = status === "emergency" ? "bg-red-500" : status === "attention" ? "bg-yellow-400" : "bg-emerald-500";
  return <span className={`inline-block h-3 w-3 shrink-0 rounded-full ${color}`} aria-label={status} />;
}

function NeedButton({
  emoji,
  label,
  onClick,
  disabled,
}: {
  emoji: string;
  label: string;
  onClick: () => void;
  disabled: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex h-28 flex-col items-center justify-center gap-1 rounded-3xl bg-slate-800 text-2xl font-semibold active:scale-95 active:bg-slate-700 disabled:opacity-60"
    >
      <span className="text-4xl" aria-hidden>
        {emoji}
      </span>
      {label}
    </button>
  );
}

function LanguageSwitch({ lang, onChange }: { lang: Language; onChange: (l: Language) => void }) {
  return (
    <div className="flex justify-center gap-2">
      {LANGUAGES.map((l) => (
        <button
          key={l}
          onClick={() => onChange(l)}
          aria-pressed={l === lang}
          className={`h-12 w-16 rounded-xl text-lg font-semibold uppercase ${
            l === lang ? "bg-teal-500 text-black" : "bg-slate-800 text-slate-300"
          }`}
        >
          {l}
        </button>
      ))}
    </div>
  );
}

function formatMmSs(ms: number) {
  const s = Math.ceil(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Nurse ETA progress, 0 → 1 over the 2:00 ETA (the ring fills up and stays full at 0:00). */
function etaProgress(alert: Alert, serverNow: number) {
  return clamp((serverNow - alert.createdAt) / ETA_MS, 0, 1);
}

function EtaRing({ progress, done, children }: { progress: number; done: boolean; children: React.ReactNode }) {
  const R = 88;
  const C = 2 * Math.PI * R;
  return (
    <div className="relative h-56 w-56 shrink-0">
      <svg viewBox="0 0 200 200" className="h-full w-full -rotate-90" aria-hidden>
        <circle cx="100" cy="100" r={R} fill="none" strokeWidth="12" className="stroke-teal-900" />
        <circle
          cx="100"
          cy="100"
          r={R}
          fill="none"
          strokeWidth="12"
          strokeLinecap="round"
          strokeDasharray={C}
          strokeDashoffset={done ? 0 : C * (1 - progress)}
          className={`transition-[stroke-dashoffset] duration-1000 ease-linear ${done ? "stroke-emerald-400" : "stroke-teal-300"}`}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">{children}</div>
    </div>
  );
}

function CheckMark() {
  return (
    <svg viewBox="0 0 24 24" className="h-24 w-24 text-emerald-400" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}

function HelpOverlay({
  t,
  lang,
  alert,
  nurse,
  serverNow,
  onBack,
  onCancel,
}: {
  t: BandStrings;
  lang: Language;
  alert: Alert;
  nurse?: Nurse;
  serverNow: number;
  onBack: () => void;
  onCancel: () => Promise<boolean>;
}) {
  const [confirming, setConfirming] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const nurseName = nurse ? nurseDisplayName(nurse.name, lang) : "";
  const acknowledged = alert.status === "acknowledged";
  const remaining = alert.createdAt + ETA_MS - serverNow;
  const flaggedOk = alert.priority === 1 && residentSaysOk(alert.summary);

  async function confirmCancel() {
    setCancelling(true);
    await onCancel();
    setCancelling(false);
    setConfirming(false);
  }

  return (
    <div
      role="alertdialog"
      aria-live="assertive"
      aria-label={t.helpComing}
      className="absolute inset-0 z-20 flex flex-col items-center overflow-y-auto bg-teal-950 px-6 pt-8 pb-[max(1.5rem,env(safe-area-inset-bottom))] text-center"
    >
      <div className="flex w-full flex-1 flex-col items-center justify-center gap-5">
        <h1 className="text-4xl font-bold leading-tight">
          {acknowledged && nurseName ? fill(t.onTheWay, { nurse: nurseName }) : t.helpComing}
        </h1>

        <EtaRing progress={etaProgress(alert, serverNow)} done={acknowledged}>
          {acknowledged ? (
            <CheckMark />
          ) : (
            <span className="text-6xl font-bold tabular-nums">{formatMmSs(Math.max(0, remaining))}</span>
          )}
        </EtaRing>

        {!acknowledged && (
          <div className="flex flex-col items-center gap-1">
            {nurseName && <div className="text-3xl font-semibold text-teal-100">{nurseName}</div>}
            {remaining <= 0 && <div className="text-xl text-teal-200">{t.anyMoment}</div>}
          </div>
        )}

        {alert.type === "voice" && alert.transcript && (
          <p className="max-w-sm text-xl italic text-teal-100/70">“{alert.transcript}”</p>
        )}
        <p className="max-w-sm text-2xl text-teal-50">
          {flaggedOk
            ? t.nurseWillCheck
            : alert.type === "voice" && alert.patientMessage
              ? alert.patientMessage
              : t.stayCalm}
        </p>
      </div>

      <div className="mt-6 flex w-full max-w-sm flex-col gap-3">
        {confirming ? (
          <>
            <div className="text-2xl font-semibold">{t.cancelConfirm}</div>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => void confirmCancel()}
                disabled={cancelling}
                className="min-h-16 rounded-2xl bg-white text-2xl font-bold text-black active:scale-95 disabled:opacity-60"
              >
                {t.yes}
              </button>
              <button
                onClick={() => setConfirming(false)}
                disabled={cancelling}
                className="min-h-16 rounded-2xl border-2 border-teal-200 text-2xl font-bold text-white active:scale-95 disabled:opacity-60"
              >
                {t.no}
              </button>
            </div>
          </>
        ) : (
          <>
            {!flaggedOk && (
              <button
                onClick={() => setConfirming(true)}
                className="min-h-16 rounded-2xl bg-white text-2xl font-bold text-black active:scale-95"
              >
                {t.cancelRequest}
              </button>
            )}
            <button
              onClick={onBack}
              className="min-h-16 rounded-2xl border-2 border-teal-200 text-2xl font-bold text-white active:scale-95"
            >
              {t.back}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

/** Slim banner on the main screen after "Back": "Help is coming · Ana · 1:42". Tap to reopen the overlay. */
function HelpBanner({
  t,
  lang,
  alert,
  nurse,
  serverNow,
  onOpen,
}: {
  t: BandStrings;
  lang: Language;
  alert: Alert;
  nurse?: Nurse;
  serverNow: number;
  onOpen: () => void;
}) {
  const nurseName = nurse ? nurseDisplayName(nurse.name, lang).replace(/^Nurse\s+/, "") : "";
  const remaining = alert.createdAt + ETA_MS - serverNow;
  const text =
    alert.status === "acknowledged" && nurseName
      ? fill(t.onTheWay, { nurse: nurseName })
      : [t.helpComing, nurseName, remaining > 0 ? formatMmSs(remaining) : t.anyMoment].filter(Boolean).join(" · ");
  return (
    <button
      onClick={onOpen}
      className="-mx-5 -mt-5 flex min-h-14 items-center justify-center gap-2 bg-teal-500 px-4 text-lg font-semibold text-black active:bg-teal-400"
    >
      <span className="h-2.5 w-2.5 shrink-0 animate-pulse rounded-full bg-black" aria-hidden />
      <span className="truncate tabular-nums">{text}</span>
    </button>
  );
}

function FallCountdown({
  t,
  secondsLeft,
  onCancel,
}: {
  t: BandStrings;
  secondsLeft: number;
  onCancel: () => void;
}) {
  return (
    <div role="alertdialog" className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-6 bg-black/95 p-8 text-center">
      <h1 className="text-5xl font-bold">{t.areYouOk}</h1>
      <p className="text-2xl text-slate-300">{t.fallDetected}</p>
      <div className="text-8xl font-black tabular-nums text-red-500">{secondsLeft}</div>
      <p className="text-xl text-slate-400">{fill(t.callingIn, { s: secondsLeft })}</p>
      <button
        onClick={onCancel}
        className="h-24 w-full max-w-sm rounded-3xl bg-emerald-500 text-4xl font-bold text-black active:scale-95"
      >
        {t.imOk}
      </button>
    </div>
  );
}

// Presenter-only controls for the dashboard phone frame (English on purpose: not resident-facing).
function DemoControls({
  hr,
  hrOverride,
  onHrOverride,
  onFall,
  onShake,
}: {
  hr: number | null;
  hrOverride: number | null;
  onHrOverride: (v: number | null) => void;
  onFall: () => void;
  onShake: () => void;
}) {
  return (
    <div className="border-t border-slate-800 bg-slate-950 p-4 text-sm text-slate-300">
      <div className="mb-2 text-xs uppercase tracking-widest text-slate-500">Demo controls</div>
      <div className="grid grid-cols-2 gap-2">
        <button onClick={onFall} className="h-11 rounded-lg bg-slate-800 font-medium hover:bg-slate-700">
          Simulate fall
        </button>
        <button onClick={onShake} className="h-11 rounded-lg bg-slate-800 font-medium hover:bg-slate-700">
          Simulate shake
        </button>
      </div>
      <label className="mt-3 flex items-center gap-3">
        <span className="w-16 shrink-0">HR {hrOverride ?? hr ?? "--"}</span>
        <input
          type="range"
          min={30}
          max={180}
          value={hrOverride ?? hr ?? 72}
          onChange={(e) => onHrOverride(Number(e.target.value))}
          className="flex-1 accent-teal-500"
          aria-label="Simulated heart rate"
        />
        <button
          onClick={() => onHrOverride(null)}
          disabled={hrOverride == null}
          className="h-9 rounded-lg bg-slate-800 px-3 font-medium hover:bg-slate-700 disabled:opacity-40"
        >
          Auto
        </button>
      </label>
      <div className="mt-1 text-xs text-slate-500">
        HR above {HR_HIGH} or below {HR_LOW} for 10s triggers a vitals alert.
      </div>
    </div>
  );
}
