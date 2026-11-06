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
} from "@/lib/detection/alertRules";
import { LANGUAGES, STRINGS, fill, nurseDisplayName, type BandStrings } from "./_lib/i18n";

const POLL_MS = 1000;
const FALL_CANCEL_S = 10;
const ETA_MS = 2 * 60_000;

const fetcher = async (url: string): Promise<StateResponse> => {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
};

export default function BandApp() {
  const params = useSearchParams();
  const residentId = params.get("resident");
  const embedded = params.get("embedded") === "1";

  if (!residentId) return <CenterMessage text={STRINGS.en.missingResident} />;
  return <Band key={residentId} residentId={residentId} embedded={embedded} />;
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

  const sendAlert = useCallback(
    async (type: BandAlertType, source?: AlertSource) => {
      if (Date.now() - lastSentRef.current < ALERT_RATE_LIMIT_MS) {
        showToast(STRINGS[lang].waitMoment);
        return;
      }
      lastSentRef.current = Date.now();
      setSending(true);
      try {
        const res = await fetch("/api/alert", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ residentId, type, source, heartRate: hrRef.current ?? undefined }),
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

  // ── Fall "Are you OK?" countdown (simulated now; real detector in Checkpoint 3) ──
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
      </div>
    );
  }

  return (
    <>
      <div className="relative flex flex-1 flex-col gap-5 p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
        <style>{`@keyframes kijo-beat{0%,100%{transform:scale(1)}15%{transform:scale(1.25)}30%{transform:scale(1)}}`}</style>

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

        <LanguageSwitch lang={lang} onChange={setLangOverride} />

        {fallSecondsLeft != null && (
          <FallCountdown t={t} secondsLeft={fallSecondsLeft} onCancel={() => setFallDeadline(null)} />
        )}
        {activeAlert && fallSecondsLeft == null && (
          <HelpOverlay
            t={t}
            lang={lang}
            alert={activeAlert}
            nurse={nurse}
            serverNow={now + clockOffset}
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

function HelpOverlay({
  t,
  lang,
  alert,
  nurse,
  serverNow,
}: {
  t: BandStrings;
  lang: Language;
  alert: Alert;
  nurse?: Nurse;
  serverNow: number;
}) {
  const nurseName = nurse ? nurseDisplayName(nurse.name, lang) : "";
  const acknowledged = alert.status === "acknowledged";
  const remaining = alert.createdAt + ETA_MS - serverNow;

  return (
    <div
      role="alertdialog"
      aria-live="assertive"
      className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-6 bg-teal-950 p-8 text-center"
    >
      <div className="text-7xl" aria-hidden>
        {acknowledged ? "🚶" : "🤝"}
      </div>
      <h1 className="text-4xl font-bold leading-tight">
        {acknowledged && nurseName ? fill(t.onTheWay, { nurse: nurseName }) : t.helpComing}
      </h1>
      {!acknowledged && (
        <div className="text-3xl text-teal-200">
          {nurseName && <span>{nurseName} — </span>}
          <span className="tabular-nums">{remaining > 0 ? formatMmSs(remaining) : t.anyMoment}</span>
        </div>
      )}
      <p className="max-w-sm text-2xl text-teal-100/80">{t.stayCalm}</p>
    </div>
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
