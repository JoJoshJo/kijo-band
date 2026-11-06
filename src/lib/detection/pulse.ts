// Camera pulse check (PPG): fingertip over the rear camera + flash. Each frame's average red brightness
// rises and falls slightly with every heartbeat. Pure functions so the math is unit-tested.
// Spot check only — not a medical device.

export interface PulseSample {
  /** ms (performance.now or frame timestamp) */
  t: number;
  /** mean red-channel brightness of the frame, 0–255 */
  v: number;
}

export const PULSE_FS = 30; // Hz, after resampling
export const PULSE_MEASURE_MS = 15_000;
export const BPM_MIN = 40;
export const BPM_MAX = 180;
const BAND_LOW_HZ = 0.7; // 42 bpm
const BAND_HIGH_HZ = 3.5; // 210 bpm
const SETTLE_S = 1.5; // drop filter start-up at both ends
const MIN_BEATS = 6;
const MAX_IBI_CV = 0.2; // beat-to-beat interval variation allowed (motion makes it jump)
const MAX_METHOD_DISAGREEMENT = 0.12; // peak count vs autocorrelation
const MAX_MOTION_FRACTION = 0.02; // share of frames with a sudden jump (finger moved)

export type PulseFailure = "too_short" | "no_signal" | "unstable";
export type PulseResult =
  | { ok: true; bpm: number; quality: number }
  | { ok: false; reason: PulseFailure; quality: number };

/** Linear-interpolate irregular frame samples onto a uniform PULSE_FS grid. */
export function resample(samples: PulseSample[], fs = PULSE_FS): number[] {
  const s = samples.filter((p) => Number.isFinite(p.t) && Number.isFinite(p.v));
  if (s.length < 2) return [];
  const step = 1000 / fs;
  const out: number[] = [];
  let j = 0;
  for (let t = s[0].t; t <= s[s.length - 1].t; t += step) {
    while (j < s.length - 2 && s[j + 1].t < t) j++;
    const a = s[j];
    const b = s[j + 1];
    const k = b.t === a.t ? 0 : (t - a.t) / (b.t - a.t);
    out.push(a.v + (b.v - a.v) * Math.min(1, Math.max(0, k)));
  }
  return out;
}

type Biquad = { b0: number; b1: number; b2: number; a1: number; a2: number };

// RBJ audio-EQ cookbook, Q = 1/√2 (Butterworth).
function lowpass(fc: number, fs: number): Biquad {
  const w = (2 * Math.PI * fc) / fs;
  const alpha = Math.sin(w) / Math.SQRT2;
  const cos = Math.cos(w);
  const a0 = 1 + alpha;
  return { b0: (1 - cos) / 2 / a0, b1: (1 - cos) / a0, b2: (1 - cos) / 2 / a0, a1: (-2 * cos) / a0, a2: (1 - alpha) / a0 };
}
function highpass(fc: number, fs: number): Biquad {
  const w = (2 * Math.PI * fc) / fs;
  const alpha = Math.sin(w) / Math.SQRT2;
  const cos = Math.cos(w);
  const a0 = 1 + alpha;
  return { b0: (1 + cos) / 2 / a0, b1: -(1 + cos) / a0, b2: (1 + cos) / 2 / a0, a1: (-2 * cos) / a0, a2: (1 - alpha) / a0 };
}

function applyBiquad(x: number[], f: Biquad): number[] {
  const y = new Array<number>(x.length);
  let x1 = x[0] ?? 0, x2 = x1, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const x0 = x[i];
    const y0 = f.b0 * x0 + f.b1 * x1 + f.b2 * x2 - f.a1 * y1 - f.a2 * y2;
    x2 = x1; x1 = x0; y2 = y1; y1 = y0;
    y[i] = y0;
  }
  return y;
}

/** Zero-phase (forward + backward) filter, like filtfilt. */
function filtfilt(x: number[], f: Biquad): number[] {
  return applyBiquad(applyBiquad(x, f).reverse(), f).reverse();
}

/** Detrend (remove mean + linear drift) and band-pass 0.7–3.5 Hz. */
export function bandpass(x: number[], fs = PULSE_FS): number[] {
  const n = x.length;
  if (n < 3) return x.slice();
  // Least-squares linear detrend: finger pressure and auto-exposure make the baseline drift.
  const mx = (n - 1) / 2;
  const my = x.reduce((a, b) => a + b, 0) / n;
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) {
    num += (i - mx) * (x[i] - my);
    den += (i - mx) ** 2;
  }
  const slope = den ? num / den : 0;
  const d = x.map((v, i) => v - my - slope * (i - mx));
  return filtfilt(filtfilt(d, highpass(BAND_LOW_HZ, fs)), lowpass(BAND_HIGH_HZ, fs));
}

function std(x: number[]): number {
  const m = x.reduce((a, b) => a + b, 0) / x.length;
  return Math.sqrt(x.reduce((a, b) => a + (b - m) ** 2, 0) / x.length);
}

function median(x: number[]): number {
  const s = [...x].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/**
 * Indices of beats: local maxima above 0.3·std, at least minGapS apart (the taller peak wins).
 * The default gap is the fastest allowed beat; given the expected period, 60% of it is used so the
 * secondary (dicrotic) bump inside a slow beat isn't counted as a beat.
 */
export function findPeaks(y: number[], fs = PULSE_FS, minGapS = 60 / BPM_MAX): number[] {
  const thr = 0.3 * std(y);
  const minGap = Math.max(1, Math.floor(minGapS * fs));
  const peaks: number[] = [];
  for (let i = 1; i < y.length - 1; i++) {
    if (y[i] <= thr || y[i] < y[i - 1] || y[i] <= y[i + 1]) continue;
    const last = peaks[peaks.length - 1];
    if (last != null && i - last < minGap) {
      if (y[i] > y[last]) peaks[peaks.length - 1] = i;
    } else {
      peaks.push(i);
    }
  }
  return peaks;
}

/**
 * Motion check on the raw signal: a moving finger makes sudden brightness jumps far bigger than the
 * pulse. Returns the fraction of frame-to-frame steps above 6× the typical (median) step.
 */
export function motionFraction(x: number[]): number {
  if (x.length < 3) return 0;
  const steps = x.slice(1).map((v, i) => Math.abs(v - x[i]));
  const typical = median(steps) || 1e-6;
  return steps.filter((d) => d > 6 * typical).length / steps.length;
}

/** Dominant period from autocorrelation within the BPM range (cross-check for the peak count). */
export function autocorrBpm(y: number[], fs = PULSE_FS): number | null {
  const minLag = Math.floor((60 / BPM_MAX) * fs);
  const maxLag = Math.ceil((60 / BPM_MIN) * fs);
  let best = -Infinity, bestLag = -1;
  const e = y.reduce((a, b) => a + b * b, 0);
  if (!e) return null;
  const r = (lag: number) => {
    let s = 0;
    for (let i = 0; i + lag < y.length; i++) s += y[i] * y[i + lag];
    return s / e;
  };
  for (let lag = minLag; lag <= Math.min(maxLag, y.length - 1); lag++) {
    const v = r(lag);
    if (v > best) {
      best = v;
      bestLag = lag;
    }
  }
  if (bestLag < 0 || best < 0.2) return null;
  // Parabolic interpolation around the best lag for sub-sample precision.
  const y0 = r(bestLag - 1), y2 = r(bestLag + 1);
  const denom = y0 - 2 * best + y2;
  const lag = denom ? bestLag + (0.5 * (y0 - y2)) / denom : bestLag;
  return (60 * fs) / lag;
}

/**
 * Raw red-brightness samples → BPM, or a failure the UI turns into "Try again — hold still".
 * quality 0–1 (beat regularity) also drives the live indicator.
 */
export function estimateBpm(samples: PulseSample[], fs = PULSE_FS): PulseResult {
  const x = resample(samples, fs);
  const settle = Math.round(SETTLE_S * fs);
  if (x.length < settle * 2 + 5 * fs) return { ok: false, reason: "too_short", quality: 0 };

  if (motionFraction(x.slice(settle, -settle)) > MAX_MOTION_FRACTION) {
    return { ok: false, reason: "unstable", quality: 0 };
  }
  const y = bandpass(x, fs).slice(settle, -settle);
  if (std(y) < 0.02) return { ok: false, reason: "no_signal", quality: 0 };

  const bpmAc = autocorrBpm(y, fs);
  const peaks = findPeaks(y, fs, bpmAc != null ? (0.6 * 60) / bpmAc : undefined);
  if (peaks.length < MIN_BEATS) return { ok: false, reason: "no_signal", quality: 0 };
  const ibis = peaks.slice(1).map((p, i) => (p - peaks[i]) / fs);
  const mean = ibis.reduce((a, b) => a + b, 0) / ibis.length;
  const cv = std(ibis) / mean;
  const quality = Math.max(0, Math.min(1, 1 - cv / (MAX_IBI_CV * 1.5)));

  const bpmPeaks = 60 / median(ibis);
  const disagree = bpmAc == null ? 1 : Math.abs(bpmAc - bpmPeaks) / bpmPeaks;
  if (cv > MAX_IBI_CV || disagree > MAX_METHOD_DISAGREEMENT) return { ok: false, reason: "unstable", quality };

  const bpm = Math.round(bpmAc != null ? (bpmPeaks + bpmAc) / 2 : bpmPeaks);
  if (bpm < BPM_MIN || bpm > BPM_MAX) return { ok: false, reason: "unstable", quality };
  return { ok: true, bpm, quality };
}

/** Is a fingertip covering the lens? Light through skin is strongly red. */
export function fingerCovered(r: number, g: number, b: number): boolean {
  return r > 25 && r > 1.5 * g && r > 1.5 * b;
}
