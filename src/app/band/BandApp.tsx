"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import useSWR from "swr";
import type { Alert, Language, Nurse, StateResponse } from "@/lib/types";
import {
  ALERT_RATE_LIMIT_MS,
  HR_HIGH,
  HR_LOW,
  VITALS_SUSTAIN_MS,
  type AlertSource,
  type BandAlertType,
  residentSaysOk,
} from "@/lib/detection/alertRules";
import { LANGUAGES, LANGUAGE_NAMES, STRINGS, fill, nurseDisplayName, type BandStrings } from "./_lib/i18n";
import { FOCUS, ICON, useLargeText } from "./_lib/a11y";
import { chime, useSpeak, vibrateSent } from "./_lib/useSpeak";
import {
  Drop,
  Heartbeat,
  Microphone,
  SmileySad,
  Siren,
  Toilet,
  Translate,
  type Icon,
} from "@phosphor-icons/react";
import { useMotionDetection } from "./_lib/useMotionDetection";
import { useVoiceTrigger, type VoiceProblem, type VoiceSnapshot } from "./_lib/useVoiceTrigger";
import { isEmergency } from "@/lib/detection/voice";
import PulseCheck from "./PulseCheck";
import TalkButton from "./TalkButton";
import type { ActivityEvent } from "@/lib/detection/activity";
import { promptInstall, useBandPwa, useInstallKind, useStoredResidentId } from "./_lib/pwa";

const POLL_MS = 1000;
const HEARTBEAT_MS = 2000;
const FALL_CANCEL_S = 10;
const MEASURED_HOLD_MS = 60_000; // a camera pulse reading replaces the simulated HR for 1 min

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
    <div className="w-full max-w-sm rounded-btn border border-line-2 bg-surface p-4 text-center">
      <div className="text-xl font-semibold">{t.installTitle}</div>
      {kind === "ios" ? (
        <div className="mt-1 text-xl text-muted">{t.installIos}</div>
      ) : (
        <button
          onClick={() => void promptInstall()}
          className={`mt-3 min-h-14 rounded-btn bg-brand px-6 py-2 text-xl font-semibold text-bg active:scale-95 ${FOCUS}`}
        >
          {t.installButton}
        </button>
      )}
    </div>
  );
}

function CenterMessage({ text }: { text: string }) {
  return <div className="flex flex-1 items-center justify-center p-8 text-center text-2xl text-muted">{text}</div>;
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
  const { data, error, mutate } = useSWR<StateResponse>("/api/state", fetcher, { refreshInterval: POLL_MS });
  const resident = data?.residents.find((r) => r.id === residentId);

  const [langOverride, setLangOverride] = useState<Language | null>(null);
  const lang: Language = langOverride ?? resident?.language ?? "en";
  const t = STRINGS[lang];
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Large text: scale the whole band (Tailwind sizes are rem) while it is on screen.
  const [largeText, setLargeText] = useLargeText();
  useEffect(() => {
    document.documentElement.style.fontSize = largeText ? "125%" : "";
    return () => {
      document.documentElement.style.fontSize = "";
    };
  }, [largeText]);

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
  // Camera pulse check result: held for MEASURED_HOLD_MS so the nurse sees the real number.
  const measuredRef = useRef<{ bpm: number; until: number } | null>(null);
  const [pulseOpen, setPulseOpen] = useState(false);
  useEffect(() => {
    hrOverrideRef.current = hrOverride;
  }, [hrOverride]);
  useEffect(() => {
    if (resident && baseHrRef.current == null) baseHrRef.current = clamp(resident.heartRate, 62, 80);
  }, [resident]);

  useEffect(() => {
    const id = setInterval(() => {
      setNow(Date.now());
      const measured = measuredRef.current;
      if (measured && Date.now() < measured.until) {
        setHr(measured.bpm);
        return;
      }
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

  const { speak, stop: stopSpeaking, speaking } = useSpeak(lang);

  // ?debug=1: voice debug panel (transcripts on screen only).
  const debug = useSearchParams().get("debug") === "1";
  const [triageDebug, setTriageDebug] = useState<{ result: string; ms: number } | null>(null);
  const [rateLimitedAt, setRateLimitedAt] = useState(0);

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

  // Help sheet (tap on the "Help is coming" banner): which alert it is open for.
  const [sheetAlertId, setSheetAlertId] = useState<string | null>(null);

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

  const onPulseResult = useCallback(
    (bpm: number) => {
      const until = Date.now() + MEASURED_HOLD_MS;
      measuredRef.current = { bpm, until };
      setHr(bpm);
      // Send now; the 2 s heartbeat keeps sending it while it is held.
      void fetch("/api/heartbeat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ residentId, heartRate: bpm }),
      }).catch(() => {});
    },
    [residentId],
  );

  /** POST to /api/alert or /api/triage with the shared 10s client-side limit and error toasts. */
  const postAlert = useCallback(
    async (url: "/api/alert" | "/api/triage", body: Record<string, unknown>) => {
      // Within the 10 s per-resident limit: say so gently instead of silently dropping it.
      const alreadySent = () => {
        showToast(STRINGS[lang].alreadySent);
        speak(STRINGS[lang].alreadySent);
        setRateLimitedAt(Date.now());
      };
      if (Date.now() - lastSentRef.current < ALERT_RATE_LIMIT_MS) return alreadySent();
      lastSentRef.current = Date.now();
      setSending(true);
      const t0 = performance.now();
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ residentId, heartRate: hrRef.current ?? undefined, ...body }),
        });
        if (debug && url === "/api/triage") {
          const j = (await res.clone().json().catch(() => ({}))) as { alert?: { priority?: number }; triage?: string };
          setTriageDebug({
            result: res.ok ? `P${j.alert?.priority ?? "?"} (${j.triage ?? "?"})` : `HTTP ${res.status}`,
            ms: Math.round(performance.now() - t0),
          });
        }
        if (res.ok) vibrateSent();
        else if (res.status === 429) alreadySent();
        else {
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
    [lang, mutate, residentId, showToast, speak, debug],
  );
  const sendAlert = useCallback(
    (type: BandAlertType, source?: AlertSource) => postAlert("/api/alert", { type, source }),
    [postAlert],
  );

  // ── Real motion detection (phone only; the embedded frame uses the simulate buttons) ──
  const fallPendingRef = useRef(false);
  const startFallRef = useRef<(source: AlertSource) => void>(() => {});
  // Inactivity (P2) and "up at night" (P3) from the on-device activity monitor; state goes with the heartbeat.
  const onActivity = useCallback(
    (e: ActivityEvent) => {
      if (e.type === "inactivity") void sendAlert("inactivity", "detector");
      else if (e.type === "up_at_night") void sendAlert("up_at_night", "detector");
    },
    [sendAlert],
  );
  const motion = useMotionDetection(started && !embedded, (e) => {
    if (fallPendingRef.current) return; // already asking "Are you OK?"
    if (e.type === "fall") {
      startFallRef.current("detector");
    } else {
      lastSentRef.current = 0; // a deliberate SOS shake must not be swallowed by the client-side limit
      void sendAlert("sos_shake", "detector");
    }
  }, onActivity);

  // ── Heartbeat: write HR (and whether the resident moved) to the DB every 2s ──
  useEffect(() => {
    if (!started) return;
    const id = setInterval(() => {
      const heartRate = hrRef.current;
      if (heartRate == null || document.visibilityState !== "visible") return;
      void fetch("/api/heartbeat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          residentId,
          heartRate: Math.round(clamp(heartRate, 20, 250)),
          moved: motion.takeMoved(),
          ...(motion.motionState() ? { motionState: motion.motionState() } : {}),
        }),
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

  // ── Spoken feedback: say out loud when help has been called and when the nurse is on the way ──
  const announcedRef = useRef<{ id: string | null; status: Alert["status"] | null } | null>(null);
  useEffect(() => {
    if (!data || !started) return;
    const a = pickActiveAlert(data.alerts, residentId);
    const prev = announcedRef.current;
    announcedRef.current = { id: a?.id ?? null, status: a?.status ?? null };
    if (!prev || !a) return; // first look: alerts that were already open are not announced again
    const n = data.nurses.find((x) => x.id === a.assignedNurseId);
    const name = n ? nurseDisplayName(n.name, lang) : "";
    const s = STRINGS[lang];
    const acked = a.status === "acknowledged" && (prev.id !== a.id || prev.status !== "acknowledged");
    if (acked) speak(`${name ? fill(s.onTheWay, { nurse: name }) : s.nurseOnTheWay}.`);
    else if (prev.id !== a.id) speak(name ? `${s.helpComing}. ${fill(s.spokenCalled, { nurse: name })}` : `${s.helpComing}.`);
  }, [data, started, residentId, lang, speak]);

  // ── Voice: background listening (trigger words) + the Talk button (one sentence, no trigger word) ──
  // Paused while the band is speaking so it doesn't hear itself.
  const canSpeak = !!resident?.canSpeak;
  const voice = useVoiceTrigger({
    enabled: started && canSpeak,
    paused: speaking,
    lang,
    debug,
    onTrigger: (sentence) => {
      // "I fell" / "I can't breathe" must not be swallowed by the 10 s limit after e.g. "water".
      if (isEmergency(sentence, lang)) lastSentRef.current = 0;
      void postAlert("/api/triage", { transcript: sentence, language: lang });
    },
    onTalk: (sentence) => void postAlert("/api/triage", { transcript: sentence, language: lang }),
    // "Kijo" alone: chime, then "Yes?" in the resident's language; the next sentence is the request.
    onWake: () => {
      chime();
      setTimeout(() => speak(STRINGS[lang].wakeYes), 350);
    },
  });
  const onTalkTap = useCallback(() => {
    stopSpeaking(); // the resident wants to talk: stop talking to them
    if (!voice.talk()) showToast(STRINGS[lang].voiceUnavailable); // synchronous: iOS needs the tap
  }, [voice, lang, showToast, stopSpeaking]);
  /** Language chosen (a tap): switch the UI and restart listening in the new language inside the tap. */
  const changeLanguage = useCallback(
    (l: Language) => {
      setLangOverride(l);
      if (started && canSpeak) voice.arm(l);
    },
    [started, canSpeak, voice],
  );

  // Fall countdown: say "Are you OK?" too (eyesight may be poor; the phone may be on the floor).
  const fallPending = fallDeadline != null;
  useEffect(() => {
    if (fallPending) speak(`${STRINGS[lang].areYouOk} ${STRINGS[lang].fallDetected}`);
  }, [fallPending, lang, speak]);

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

  const [motionDenied, setMotionDenied] = useState(false);
  const handleStart = useCallback(async () => {
    // iOS: everything that needs the user gesture is CALLED synchronously here, before any await —
    // the motion permission prompt and the speech recognizer (which asks for the microphone itself).
    const DME = typeof DeviceMotionEvent !== "undefined"
      ? (DeviceMotionEvent as unknown as { requestPermission?: () => Promise<PermissionState> })
      : undefined;
    let motionPermission: Promise<PermissionState> | null = null;
    try {
      motionPermission = DME?.requestPermission ? DME.requestPermission() : null;
    } catch {
      motionPermission = Promise.resolve("denied");
    }
    if (canSpeak) voice.arm();
    if (motionPermission) {
      const state = await motionPermission.catch(() => "denied" as PermissionState);
      if (process.env.NODE_ENV !== "production") console.debug(`[motion] permission ${state}`);
      setMotionDenied(state !== "granted"); // falls can't be detected; buttons still work
    }
    await requestWakeLock();
    setStarted(true);
  }, [canSpeak, voice, requestWakeLock]);

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
          <div className="mt-1 text-xl text-muted">
            {t.room} {resident.room}
          </div>
        </div>
        <button
          onClick={handleStart}
          className={`flex aspect-square w-[70vw] max-w-80 items-center justify-center rounded-full bg-brand text-4xl font-bold text-bg shadow-[0_0_60px_rgba(43,179,163,0.45)] active:scale-95 ${FOCUS}`}
        >
          {t.start}
        </button>
        <div className="text-xl text-muted">{t.startHint}</div>
        <LanguageSwitch t={t} lang={lang} onChange={changeLanguage} />
        <LargeTextSwitch t={t} on={largeText} onChange={setLargeText} />
        <InstallHint t={t} />
      </div>
    );
  }

  const helpComing = activeAlert != null;
  const sheetAlert = activeAlert && activeAlert.id === sheetAlertId ? activeAlert : undefined;

  return (
    <>
      <div className="relative flex flex-1 touch-manipulation flex-col gap-4 p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
        {activeAlert && fallSecondsLeft == null && (
          <AlertBanner t={t} lang={lang} alert={activeAlert} nurse={nurse} onOpen={() => setSheetAlertId(activeAlert.id)} />
        )}

        {/* Top bar: name · room, then Translate (language + large text) and Heartbeat (pulse check) */}
        <header className="flex items-center justify-between gap-3">
          <div className="min-w-0 text-xl leading-snug break-words">
            <span className="whitespace-nowrap font-semibold">{resident.name}</span>
            <span className="whitespace-nowrap text-muted">
              {" · "}
              {t.room} {resident.room}
            </span>
          </div>
          <div className="flex shrink-0 gap-2">
            <IconButton
              icon={Translate}
              label={`${t.settings}: ${t.language} (${LANGUAGE_NAMES[lang]}), ${t.largeText}`}
              onClick={() => setSettingsOpen(true)}
            />
            <IconButton icon={Heartbeat} label={t.checkPulse} onClick={() => setPulseOpen(true)} />
          </div>
        </header>

        <VoiceStatus
          t={t}
          canSpeak={canSpeak}
          listening={voice.listening}
          talking={voice.talking}
          paused={speaking}
          needsTap={voice.needsTap}
          problem={voice.problem}
          motionDenied={motionDenied && !embedded}
          onResume={() => voice.arm()}
        />

        {/* Center: tap and talk */}
        <div className="flex flex-1 items-center justify-center py-2">
          <TalkButton
            color={helpComing ? "green" : "red"}
            active={voice.talking || voice.capturing}
            label={voice.talking || voice.capturing ? t.listening : t.tapToTalk}
            hint={canSpeak && !voice.problem ? t.orSayKijo : undefined}
            disabled={sending}
            onClick={onTalkTap}
          />
        </div>

        {/* Quick buttons */}
        <div className="grid grid-cols-2 gap-3">
          <NeedButton icon={Drop} tone="info" label={t.water} disabled={sending} onClick={() => void sendAlert("need_water")} />
          <NeedButton icon={Toilet} tone="brand" label={t.bathroom} disabled={sending} onClick={() => void sendAlert("need_bathroom")} />
          <NeedButton icon={SmileySad} tone="neutral" label={t.pain} disabled={sending} onClick={() => void sendAlert("need_pain")} />
          <NeedButton
            icon={Siren}
            tone="alarm"
            label={t.needHelp}
            disabled={sending}
            onClick={() => void sendAlert("need_help", "big_help")}
          />
        </div>

        <div className="min-h-7 text-center text-xl text-muted" role="status" aria-live="polite">
          {sending ? t.sending : toast ?? (error ? t.offline : "")}
        </div>

        {sheetAlert && fallSecondsLeft == null && (
          <HelpSheet
            key={sheetAlert.id}
            t={t}
            alert={sheetAlert}
            onClose={() => setSheetAlertId(null)}
            onCancel={() => cancelAlert(sheetAlert.id)}
          />
        )}

        {settingsOpen && (
          <SettingsSheet
            t={t}
            lang={lang}
            onLang={changeLanguage}
            largeText={largeText}
            onLargeText={setLargeText}
            onClose={() => setSettingsOpen(false)}
          />
        )}

        {debug && (
          <VoiceDebug
            snap={voice.snapshot}
            triage={triageDebug}
            rateLimited={rateLimitedAt > 0 && now - rateLimitedAt < 5000}
          />
        )}

        {pulseOpen && <PulseCheck t={t} onClose={() => setPulseOpen(false)} onResult={onPulseResult} />}

        {fallSecondsLeft != null && (
          <FallCountdown t={t} secondsLeft={fallSecondsLeft} onCancel={() => setFallDeadline(null)} />
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

/**
 * One line under the header: "● Listening" while background listening is on, a "Tap to resume
 * listening" button when iOS stopped it, or a hint when voice / fall detection can't work here.
 */
/** ?debug=1 only. Transcripts are shown here and nowhere else (never logged, never sent). */
function VoiceDebug({
  snap,
  triage,
  rateLimited,
}: {
  snap: VoiceSnapshot;
  triage: { result: string; ms: number } | null;
  rateLimited: boolean;
}) {
  const rows: [string, string][] = [
    ["state", `${snap.state} · ${snap.mode}${snap.needsTap ? " · needs tap" : ""}${snap.problem ? ` · ${snap.problem}` : ""}`],
    ["engine", `${snap.engine} · ${snap.lang}`],
    ["interim", snap.lastInterim || "—"],
    ["final", snap.lastFinal || "—"],
    ["decision", rateLimited ? "rate-limited (Already sent)" : snap.decision || "—"],
    ["triage", triage ? `${triage.result} · ${triage.ms} ms` : "—"],
    ["restarts", `${snap.restarts} · last error ${snap.lastError || "—"}`],
  ];
  return (
    <section aria-label="Voice debug" className="rounded-card border border-line bg-surface p-3 font-mono text-base">
      {rows.map(([k, v]) => (
        <div key={k} className="flex gap-2">
          <span className="w-20 shrink-0 text-muted">{k}</span>
          <span className="break-words" data-debug={k}>{v}</span>
        </div>
      ))}
    </section>
  );
}

function VoiceStatus({
  t,
  canSpeak,
  listening,
  talking,
  paused,
  needsTap,
  problem,
  motionDenied,
  onResume,
}: {
  t: BandStrings;
  canSpeak: boolean;
  listening: boolean;
  talking: boolean;
  paused: boolean;
  needsTap: boolean;
  problem: VoiceProblem | null;
  motionDenied: boolean;
  onResume: () => void;
}) {
  const hint = canSpeak && problem
    ? {
        unsupported: t.voiceUnavailable,
        "open-in-safari": t.voiceOpenSafari,
        "dictation-off": t.voiceDictationOff,
        "mic-blocked": t.voiceMicBlocked,
      }[problem]
    : null;
  return (
    <div className="flex min-h-10 flex-col items-center gap-2" role="status" aria-live="polite">
      {canSpeak && !problem && needsTap && !talking && (
        <button
          onClick={onResume}
          className={`flex min-h-14 items-center gap-3 rounded-full bg-brand px-6 text-xl font-semibold text-bg active:scale-95 ${FOCUS}`}
        >
          <MicGlyph />
          {t.resumeListening}
        </button>
      )}
      {canSpeak && !problem && !needsTap && (listening || paused) && !talking && (
        <div className="flex items-center gap-2 rounded-full border border-ok/30 bg-ok/10 px-4 py-1 text-xl text-ok">
          <span className="relative flex h-3 w-3" aria-hidden>
            <span className="absolute inline-flex h-full w-full rounded-full bg-ok opacity-60 motion-safe:animate-ping" />
            <span className="relative inline-flex h-3 w-3 rounded-full bg-ok" />
          </span>
          <MicGlyph />
          {t.listeningOn}
        </div>
      )}
      {hint && <p className="text-center text-xl text-warn">{hint}</p>}
      {motionDenied && <p className="text-center text-xl text-warn">{t.motionDenied}</p>}
    </div>
  );
}

function MicGlyph() {
  return <Microphone size={ICON.inline} weight="fill" aria-hidden />;
}

/** Square-ish icon button in the top bar (56px target, 30px Phosphor fill icon). */
function IconButton({ icon: I, label, onClick }: { icon: Icon; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      aria-haspopup="dialog"
      className={`flex h-14 w-14 items-center justify-center rounded-btn border border-line bg-surface-2 text-ink active:scale-95 ${FOCUS}`}
    >
      <I size={ICON.bar} weight="fill" aria-hidden />
    </button>
  );
}

const CARD_TONES = {
  info: { card: "border-info/35 bg-info/10 active:bg-info/20", icon: "text-info" },
  brand: { card: "border-brand/35 bg-brand/10 active:bg-brand/20", icon: "text-brand" },
  neutral: { card: "border-line-2 bg-surface-2 active:bg-line-2", icon: "text-ink" },
  // The red Help (P1) for residents who can't speak: red-tinted with a red border.
  alarm: { card: "border-2 border-alarm bg-alarm/15 active:bg-alarm/25", icon: "text-alarm" },
} as const;

/** Quick-request card: tinted, icon above the word, ≥ 84px tall, radius 18. */
function NeedButton({
  icon: I,
  tone,
  label,
  onClick,
  disabled,
}: {
  icon: Icon;
  tone: keyof typeof CARD_TONES;
  label: string;
  onClick: () => void;
  disabled: boolean;
}) {
  const c = CARD_TONES[tone];
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex min-h-[84px] flex-col items-center justify-center gap-1.5 rounded-[18px] border px-2 py-3 text-2xl font-semibold text-ink active:scale-95 disabled:opacity-60 ${c.card} ${FOCUS}`}
    >
      <I size={ICON.card} weight="fill" className={c.icon} aria-hidden />
      {label}
    </button>
  );
}

function LanguageSwitch({ t, lang, onChange }: { t: BandStrings; lang: Language; onChange: (l: Language) => void }) {
  return (
    <div role="group" aria-label={t.language} className="flex justify-center gap-2">
      {LANGUAGES.map((l) => (
        <button
          key={l}
          onClick={() => onChange(l)}
          aria-pressed={l === lang}
          aria-label={LANGUAGE_NAMES[l]}
          lang={l}
          className={`h-14 min-w-20 rounded-btn px-3 text-xl font-semibold uppercase ${FOCUS} ${
            l === lang ? "border border-brand bg-brand text-bg" : "border border-line-2 bg-surface-2 text-ink"
          }`}
        >
          {l}
        </button>
      ))}
    </div>
  );
}

/** On/off switch for large text (remembered on this phone). */
function LargeTextSwitch({ t, on, onChange }: { t: BandStrings; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className={`flex min-h-16 w-full max-w-sm items-center justify-between gap-4 rounded-btn bg-surface-2 px-5 text-2xl font-semibold ${FOCUS}`}
    >
      <span className="flex items-center gap-3 text-left">
        <span className="shrink-0 leading-none" aria-hidden>
          <span className="text-[1.25em]">A</span>
          <span className="text-[0.85em]">A</span>
        </span>
        <span>{t.largeText}</span>
      </span>
      <span
        aria-hidden
        className={`relative h-9 w-16 shrink-0 rounded-full border-2 transition-colors motion-reduce:transition-none ${
          on ? "border-brand bg-brand" : "border-line-2 bg-surface"
        }`}
      >
        <span
          className={`absolute top-1 h-6 w-6 rounded-full transition-[left] motion-reduce:transition-none ${
            on ? "left-8 bg-bg" : "left-1 bg-muted"
          }`}
        />
      </span>
    </button>
  );
}

/**
 * Bottom sheet: dims the screen, moves focus into the dialog, Escape or a tap outside closes it,
 * and focus returns to the control that opened it.
 */
function Sheet({ label, onClose, children }: { label: string; onClose: () => void; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);
  // Mount only: the band re-renders every second (polling), which must not move focus.
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>("button")?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCloseRef.current();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      opener?.focus?.();
    };
  }, []);
  return (
    <div className="fixed inset-0 z-20 flex flex-col justify-end bg-bg/70" onClick={onClose}>
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        onClick={(e) => e.stopPropagation()}
        className="flex flex-col gap-4 rounded-t-[18px] border-t border-line bg-surface p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] text-center"
      >
        {children}
      </div>
    </div>
  );
}

/** Behind the language icon: language + large text. */
function SettingsSheet({
  t,
  lang,
  onLang,
  largeText,
  onLargeText,
  onClose,
}: {
  t: BandStrings;
  lang: Language;
  onLang: (l: Language) => void;
  largeText: boolean;
  onLargeText: (v: boolean) => void;
  onClose: () => void;
}) {
  return (
    <Sheet label={t.settings} onClose={onClose}>
      <h2 className="flex items-center justify-center gap-3 text-2xl font-semibold">
        <Translate size={ICON.heading} weight="fill" className="text-muted" aria-hidden />
        {t.settings}
      </h2>
      <LanguageSwitch t={t} lang={lang} onChange={onLang} />
      <div className="flex justify-center">
        <LargeTextSwitch t={t} on={largeText} onChange={onLargeText} />
      </div>
      <button
        onClick={onClose}
        className={`min-h-16 rounded-btn border-2 border-line-2 bg-surface-2 text-2xl font-bold active:scale-95 ${FOCUS}`}
      >
        {t.close}
      </button>
    </Sheet>
  );
}

/** Top notification while help is coming; tap to open the sheet. Hides itself once the alert is resolved. */
function AlertBanner({
  t,
  lang,
  alert,
  nurse,
  onOpen,
}: {
  t: BandStrings;
  lang: Language;
  alert: Alert;
  nurse?: Nurse;
  onOpen: () => void;
}) {
  const nurseName = nurse ? nurseDisplayName(nurse.name, lang) : "";
  // Shared wording: "Help is coming" → "Nurse Ana is on the way" (or "Your nurse is on the way").
  const text =
    alert.status !== "acknowledged" ? t.helpComing : nurseName ? fill(t.onTheWay, { nurse: nurseName }) : t.nurseOnTheWay;
  return (
    <button
      onClick={onOpen}
      aria-haspopup="dialog"
      className={`-mx-5 -mt-5 flex min-h-16 items-center justify-center gap-3 bg-ok px-4 text-xl font-semibold text-bg active:brightness-90 ${FOCUS} focus-visible:-outline-offset-8`}
    >
      <span className="h-3 w-3 shrink-0 rounded-full bg-bg motion-safe:animate-pulse" aria-hidden />
      <span className="truncate">{text}</span>
    </button>
  );
}

/** Small bottom sheet from the banner: reassurance + "I'm OK" (P1: flagged, never resolved). */
function HelpSheet({
  t,
  alert,
  onClose,
  onCancel,
}: {
  t: BandStrings;
  alert: Alert;
  onClose: () => void;
  onCancel: () => Promise<boolean>;
}) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const flaggedOk = alert.priority === 1 && residentSaysOk(alert.summary);
  const message = flaggedOk
    ? t.nurseWillCheck
    : alert.type === "voice" && alert.patientMessage
      ? alert.patientMessage
      : t.stayCalm;

  async function confirmCancel() {
    setBusy(true);
    const ok = await onCancel();
    setBusy(false);
    setConfirming(false);
    if (ok && alert.priority !== 1) onClose();
  }

  return (
    <Sheet label={t.helpComing} onClose={onClose}>
        <p className="text-2xl leading-snug">{message}</p>
        {confirming ? (
          <>
            <div className="text-2xl font-semibold">{t.cancelConfirm}</div>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => void confirmCancel()}
                disabled={busy}
                className={`min-h-16 rounded-btn bg-brand text-2xl font-bold text-bg active:scale-95 disabled:opacity-60 ${FOCUS}`}
              >
                {t.yesCancel}
              </button>
              <button
                onClick={() => setConfirming(false)}
                disabled={busy}
                className={`min-h-16 rounded-btn border-2 border-line-2 bg-surface-2 text-2xl font-bold active:scale-95 disabled:opacity-60 ${FOCUS}`}
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
                className={`min-h-16 rounded-btn bg-brand text-2xl font-bold text-bg active:scale-95 ${FOCUS}`}
              >
                {t.cancelRequest}
              </button>
            )}
            <button
              onClick={onClose}
              className={`min-h-16 rounded-btn border-2 border-line-2 bg-surface-2 text-2xl font-bold active:scale-95 ${FOCUS}`}
            >
              {t.close}
            </button>
          </>
        )}
    </Sheet>
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
    <div role="alertdialog" aria-modal="true" aria-label={t.areYouOk} className="fixed inset-0 z-30 flex flex-col items-center justify-center gap-6 bg-bg p-8 text-center">
      <h1 className="text-5xl font-bold">{t.areYouOk}</h1>
      <p className="text-2xl text-muted">{t.fallDetected}</p>
      <div className="num text-8xl font-semibold text-alarm">{secondsLeft}</div>
      <p className="text-xl text-muted">{fill(t.callingIn, { s: secondsLeft })}</p>
      <button
        onClick={onCancel}
        autoFocus
        className={`h-24 w-full max-w-sm rounded-[18px] bg-ok text-4xl font-bold text-bg active:scale-95 ${FOCUS}`}
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
    <div className="border-t border-line bg-surface p-4 text-sm text-muted">
      <div className="mb-2 text-xs uppercase tracking-widest text-muted">Demo controls</div>
      <div className="grid grid-cols-2 gap-2">
        <button onClick={onFall} className="h-11 rounded-lg bg-surface-2 font-medium hover:bg-line-2">
          Simulate fall
        </button>
        <button onClick={onShake} className="h-11 rounded-lg bg-surface-2 font-medium hover:bg-line-2">
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
          className="flex-1 accent-brand"
          aria-label="Simulated heart rate"
        />
        <button
          onClick={() => onHrOverride(null)}
          disabled={hrOverride == null}
          className="h-9 rounded-lg bg-surface-2 px-3 font-medium hover:bg-line-2 disabled:opacity-40"
        >
          Auto
        </button>
      </label>
      <div className="mt-1 text-xs text-muted">
        HR above {HR_HIGH} or below {HR_LOW} for 10s triggers a vitals alert.
      </div>
    </div>
  );
}
