"use client";

import { useEffect, useRef, useState } from "react";
import {
  PULSE_MEASURE_MS,
  bandpass,
  estimateBpm,
  fingerCovered,
  resample,
  type PulseSample,
} from "@/lib/detection/pulse";
import type { BandStrings } from "./_lib/i18n";

type Phase = "intro" | "measuring" | "done" | "failed" | "error";
type Quality = "good" | "fair" | "poor" | null;

const UNCOVERED_RESET_MS = 700; // finger lifted this long → start the 15 s over
const UI_EVERY_MS = 100;
const WAVE_SECONDS = 4;
const LIVE_WINDOW_MS = 9000; // ≥ the 8 s estimateBpm needs, with margin for frame timing
const SAMPLE_W = 32;
const SAMPLE_H = 24;

/**
 * "Check pulse" (spec section 4 bonus): fingertip over the rear camera + flash, 15 s of red-brightness
 * samples → BPM (src/lib/detection/pulse.ts). Frames are reduced to an average colour on the phone;
 * no image or video leaves the device. Spot check only — not a medical device.
 */
export default function PulseCheck({
  t,
  onClose,
  onResult,
}: {
  t: BandStrings;
  onClose: () => void;
  /** Called once with the measured BPM; the band shows it and sends it to /api/heartbeat. */
  onResult: (bpm: number) => void;
}) {
  const [phase, setPhase] = useState<Phase>("intro");
  const [torch, setTorch] = useState<boolean | null>(null);
  const [covered, setCovered] = useState(false);
  const [progress, setProgress] = useState(0);
  const [wave, setWave] = useState<number[]>([]);
  const [quality, setQuality] = useState<Quality>(null);
  const [bpm, setBpm] = useState<number | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const stopLoopRef = useRef<() => void>(() => {});

  function stopCamera() {
    stopLoopRef.current();
    streamRef.current?.getTracks().forEach((tr) => tr.stop()); // also turns the torch off
    streamRef.current = null;
  }
  useEffect(() => stopCamera, []);

  async function start() {
    setBpm(null);
    setQuality(null);
    setProgress(0);
    setWave([]);
    let stream: MediaStream;
    try {
      // Must run inside the tap (iOS). Small frames are plenty: only the average colour is used.
      stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: "environment" }, width: { ideal: 320 }, height: { ideal: 240 }, frameRate: { ideal: 30 } },
      });
    } catch {
      setPhase("error");
      return;
    }
    streamRef.current = stream;
    const track = stream.getVideoTracks()[0];
    let torchOn = false;
    try {
      const caps = track.getCapabilities?.() as (MediaTrackCapabilities & { torch?: boolean }) | undefined;
      if (caps?.torch) {
        await track.applyConstraints({ advanced: [{ torch: true } as MediaTrackConstraintSet] });
        torchOn = true;
      }
    } catch {
      // No torch control (iPhone Safari): ambient light through the fingertip still works, just weaker.
    }
    setTorch(torchOn);

    const video = videoRef.current;
    if (!video) return;
    video.srcObject = stream;
    try {
      await video.play();
    } catch {
      setPhase("error");
      stopCamera();
      return;
    }
    setPhase("measuring");
    runLoop(video);
  }

  function runLoop(video: HTMLVideoElement) {
    const canvas = document.createElement("canvas");
    canvas.width = SAMPLE_W;
    canvas.height = SAMPLE_H;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) {
      setPhase("error");
      return;
    }
    const samples: PulseSample[] = [];
    let coveredSince: number | null = null;
    let uncoveredSince: number | null = null;
    let lastUi = 0;
    let stopped = false;
    let handle = 0;
    const useRvfc = typeof video.requestVideoFrameCallback === "function";

    const schedule = () => {
      handle = useRvfc ? video.requestVideoFrameCallback(() => frame(performance.now())) : requestAnimationFrame(frame);
    };
    stopLoopRef.current = () => {
      stopped = true;
      if (useRvfc) video.cancelVideoFrameCallback(handle);
      else cancelAnimationFrame(handle);
    };

    const frame = (now: number) => {
      if (stopped) return;
      if (video.videoWidth) {
        ctx.drawImage(video, 0, 0, SAMPLE_W, SAMPLE_H);
        const px = ctx.getImageData(0, 0, SAMPLE_W, SAMPLE_H).data;
        let r = 0, g = 0, b = 0;
        for (let i = 0; i < px.length; i += 4) {
          r += px[i];
          g += px[i + 1];
          b += px[i + 2];
        }
        const n = px.length / 4;
        r /= n; g /= n; b /= n;

        if (fingerCovered(r, g, b)) {
          uncoveredSince = null;
          coveredSince ??= now;
          samples.push({ t: now, v: r });
        } else {
          uncoveredSince ??= now;
          if (coveredSince != null && now - uncoveredSince > UNCOVERED_RESET_MS) {
            coveredSince = null; // finger lifted: start over
            samples.length = 0;
          }
        }

        const elapsed = coveredSince == null ? 0 : now - coveredSince;
        if (elapsed >= PULSE_MEASURE_MS) {
          stopCamera();
          const result = estimateBpm(samples);
          setProgress(1);
          setQuality(result.quality >= 0.75 ? "good" : result.quality >= 0.4 ? "fair" : "poor");
          if (result.ok) {
            setBpm(result.bpm);
            setPhase("done");
            onResult(result.bpm);
          } else {
            setPhase("failed");
          }
          return;
        }

        if (now - lastUi >= UI_EVERY_MS) {
          lastUi = now;
          setCovered(coveredSince != null);
          setProgress(elapsed / PULSE_MEASURE_MS);
          const recent = samples.filter((s) => s.t >= now - WAVE_SECONDS * 1000 - 1500);
          const y = recent.length > 20 ? bandpass(resample(recent)).slice(45) : [];
          setWave(y);
          const live = samples.filter((s) => s.t >= now - LIVE_WINDOW_MS);
          if (coveredSince == null) setQuality(null);
          else if (elapsed > LIVE_WINDOW_MS) {
            const q = estimateBpm(live);
            // too_short = window edge effect, not a bad signal: keep the last indicator.
            if (q.ok || q.reason !== "too_short") setQuality(q.ok && q.quality >= 0.75 ? "good" : q.ok ? "fair" : "poor");
          }
        }
      }
      schedule();
    };
    schedule();
  }

  const qualityLabel = quality === "good" ? t.qualityGood : quality === "fair" ? t.qualityFair : quality === "poor" ? t.qualityPoor : "…";
  const qualityColor = quality === "good" ? "bg-emerald-400" : quality === "fair" ? "bg-yellow-400" : quality === "poor" ? "bg-red-500" : "bg-slate-600";

  return (
    <div
      role="dialog"
      aria-label={t.checkPulse}
      className="fixed inset-0 z-[25] flex flex-col items-center overflow-y-auto bg-black px-6 pt-8 pb-[max(1.5rem,env(safe-area-inset-bottom))] text-center"
    >
      <h1 className="text-4xl font-bold">{t.checkPulse}</h1>
      <p className="mt-1 text-base text-slate-400">{t.pulseDisclaimer}</p>

      <div className="flex w-full max-w-sm flex-1 flex-col items-center justify-center gap-5">
        {/* Camera preview: turns red when the fingertip covers the lens */}
        <video
          ref={videoRef}
          playsInline
          muted
          aria-hidden
          className={`h-20 w-20 rounded-full object-cover ring-4 ${covered ? "ring-red-500" : "ring-slate-700"} ${phase === "measuring" ? "" : "pointer-events-none absolute h-px w-px opacity-0"}`}
        />

        {phase === "intro" && <p className="text-2xl leading-snug">{t.pulseInstructions}</p>}
        {phase === "error" && <p className="text-2xl leading-snug text-red-300">{t.pulseNoCamera}</p>}

        {phase === "measuring" && (
          <>
            <p className="text-2xl leading-snug">{covered ? t.pulseHoldStill : t.pulseCover}</p>
            {torch === false && <p className="text-lg text-yellow-200">{t.pulseNoTorch}</p>}
            <PulseWave y={wave} />
            <div className="h-3 w-full overflow-hidden rounded-full bg-slate-800">
              <div className="h-full bg-teal-400 transition-[width] duration-100" style={{ width: `${Math.round(progress * 100)}%` }} />
            </div>
            <div className="flex items-center gap-2 text-xl" aria-live="polite">
              <span className={`inline-block h-3 w-3 rounded-full ${qualityColor}`} aria-hidden />
              {t.pulseSignal}: {qualityLabel}
            </div>
          </>
        )}

        {phase === "done" && bpm != null && (
          <>
            <div className="flex items-baseline gap-2">
              <span className="text-8xl font-black tabular-nums">{bpm}</span>
              <span className="text-2xl text-slate-400">{t.bpm}</span>
            </div>
            <p className="text-xl text-emerald-300">{t.pulseSent}</p>
          </>
        )}
        {phase === "failed" && <p className="text-3xl font-semibold text-yellow-200">{t.pulseTryAgain}</p>}
      </div>

      <div className="mt-6 flex w-full max-w-sm flex-col gap-3">
        {(phase === "intro" || phase === "failed" || phase === "error") && (
          <button
            onClick={() => void start()}
            className="min-h-16 rounded-2xl bg-teal-500 text-2xl font-bold text-black active:scale-95"
          >
            {phase === "intro" ? t.pulseStart : t.pulseRetry}
          </button>
        )}
        <button
          onClick={() => {
            stopCamera();
            onClose();
          }}
          className="min-h-16 rounded-2xl border-2 border-slate-500 text-2xl font-bold text-white active:scale-95"
        >
          {phase === "done" ? t.pulseDone : t.back}
        </button>
      </div>
    </div>
  );
}

/** Live pulse wave (band-passed signal of the last few seconds). */
function PulseWave({ y }: { y: number[] }) {
  const W = 300;
  const H = 90;
  let points = "";
  if (y.length > 1) {
    const max = Math.max(...y.map(Math.abs)) || 1;
    points = y.map((v, i) => `${((i / (y.length - 1)) * W).toFixed(1)},${(H / 2 - (v / max) * (H / 2 - 6)).toFixed(1)}`).join(" ");
  }
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-24 w-full rounded-xl bg-slate-900" aria-hidden>
      <line x1="0" y1={H / 2} x2={W} y2={H / 2} className="stroke-slate-800" strokeWidth="1" />
      {points && <polyline points={points} fill="none" strokeWidth="3" strokeLinejoin="round" className="stroke-red-400" />}
    </svg>
  );
}
