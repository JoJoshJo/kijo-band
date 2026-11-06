// On-device fall + shake detection (spec section 4). Pure and framework-free so it can be unit-tested
// with synthetic samples. Feed it DeviceMotion `accelerationIncludingGravity` samples in m/s².
//
// Fall:  free-fall (< 0.5 g for ≥ FREEFALL_MIN_MS) → impact (> 2.5 g) within 1 s → after a short
//        settle, low movement for 3 s (demo value; real product ~60 s) → "fall".
// Shake: ≥ 3 peaks > 1.2 g of DYNAMIC acceleration (gravity removed with a low-pass estimate) within
//        1.5 s, consecutive peaks ≤ 450 ms apart (rules out walking cadence), with no free-fall phase in
//        that window → "shake". Gravity is removed because the total magnitude hides real shakes:
//        side to side it is √(1 + a²) (a firm 1.6 g shake reads 1.84 g), and up and down every other
//        stroke stops against gravity (|1 − a|), so only half the strokes would count.

export const G = 9.80665;

export interface MotionSample {
  /** Timestamp in ms (monotonic). */
  t: number;
  /** Acceleration including gravity, m/s². */
  x: number;
  y: number;
  z: number;
}

export interface MotionConfig {
  freefallG: number;
  freefallMinMs: number;
  impactG: number;
  impactWindowMs: number;
  settleMs: number;
  stillMs: number;
  /** Max |g − 1| allowed during the stillness window. */
  stillToleranceG: number;
  /** Peak threshold on dynamic acceleration (gravity removed), in g. */
  shakePeakG: number;
  /** Dynamic acceleration must fall back below this before the next peak can count (hysteresis). */
  shakeResetG: number;
  /** Time constant of the gravity (low-pass) estimate used to remove gravity for shake detection. */
  gravityTauMs: number;
  shakePeaks: number;
  shakeWindowMs: number;
  shakeMinPeakGapMs: number;
  /** Peaks further apart than this start a new sequence. Shaking is ≥ ~2.5 Hz; walking cadence is ≤ ~2 Hz. */
  shakeMaxPeakGapMs: number;
  /** After any detection, ignore new detections for this long. */
  cooldownMs: number;
  /** |g − 1| above this counts as "the resident moved" (for last_motion_at). */
  movementG: number;
}

export const DEFAULT_MOTION_CONFIG: MotionConfig = {
  freefallG: 0.5,
  freefallMinMs: 100,
  impactG: 2.5,
  impactWindowMs: 1000,
  settleMs: 500,
  stillMs: 3000,
  stillToleranceG: 0.3,
  shakePeakG: 1.2,
  shakeResetG: 0.6,
  gravityTauMs: 800,
  shakePeaks: 3,
  shakeWindowMs: 1500,
  shakeMinPeakGapMs: 120,
  shakeMaxPeakGapMs: 450,
  cooldownMs: 3000,
  movementG: 0.15,
};

export type MotionEvent =
  | { type: "fall"; t: number; impactG: number }
  | { type: "shake"; t: number; peaks: number };

type FallState =
  | { s: "idle" }
  | { s: "armed"; freefallEnd: number } // free-fall seen, waiting for impact
  | { s: "settling"; impactAt: number; impactG: number }
  | { s: "still"; impactG: number; stillSince: number };

export class MotionDetector {
  private readonly c: MotionConfig;
  private fall: FallState = { s: "idle" };
  private freefallStart: number | null = null;
  /** End time of the most recent qualifying free-fall phase (for shake exclusion). */
  private lastFreefallAt = -Infinity;
  private peaks: number[] = [];
  private peakArmed = true; // hysteresis: true once magnitude has dropped below shakeResetG
  private cooldownUntil = -Infinity;
  private moved = false;
  /** Low-pass gravity estimate (m/s²) and the last sample time, for the dynamic (shake) signal. */
  private grav: [number, number, number] | null = null;
  private lastT: number | null = null;
  /** For the ?debug=1 panel: recent dynamic peaks and the last decision. */
  private recentDyn: { t: number; g: number }[] = [];
  private lastDecision = "";

  constructor(config: Partial<MotionConfig> = {}) {
    this.c = { ...DEFAULT_MOTION_CONFIG, ...config };
  }

  /** True if the device moved since the last call; resets the flag. */
  takeMoved(): boolean {
    const m = this.moved;
    this.moved = false;
    return m;
  }

  /** Debug only: live peak dynamic g (last 1.5 s), peaks in the shake window, last decision. */
  debug(): { peakG: number; peaks: number; decision: string; fall: string } {
    return {
      peakG: Math.round(Math.max(0, ...this.recentDyn.map((d) => d.g)) * 100) / 100,
      peaks: this.peaks.length,
      decision: this.lastDecision,
      fall: this.fall.s,
    };
  }

  reset(): void {
    this.fall = { s: "idle" };
    this.freefallStart = null;
    this.peaks = [];
    this.peakArmed = true;
  }

  push(sample: MotionSample): MotionEvent | null {
    const { x, y, z, t } = sample;
    if (![x, y, z, t].every(Number.isFinite)) return null;
    const g = Math.hypot(x, y, z) / G;
    const c = this.c;

    // Dynamic acceleration = sample minus the low-pass gravity estimate (shake only; falls use g).
    if (!this.grav || this.lastT == null || t <= this.lastT) this.grav = [x, y, z];
    const dyn = Math.hypot(x - this.grav[0], y - this.grav[1], z - this.grav[2]) / G;
    const dt = this.lastT == null ? 0 : Math.max(0, Math.min(t - this.lastT, 200));
    const k = dt / (c.gravityTauMs + dt);
    this.grav = [this.grav[0] + k * (x - this.grav[0]), this.grav[1] + k * (y - this.grav[1]), this.grav[2] + k * (z - this.grav[2])];
    this.lastT = t;
    this.recentDyn.push({ t, g: dyn });
    while (this.recentDyn.length && t - this.recentDyn[0].t > c.shakeWindowMs) this.recentDyn.shift();

    if (Math.abs(g - 1) > c.movementG) this.moved = true;

    // ── Free-fall phase tracking (shared by both detectors) ──
    let freefallJustEnded = false;
    if (g < c.freefallG) {
      this.freefallStart ??= t;
    } else if (this.freefallStart != null) {
      if (t - this.freefallStart >= c.freefallMinMs) {
        freefallJustEnded = true;
        this.lastFreefallAt = t;
      }
      this.freefallStart = null;
    }
    // A long free-fall still in progress also counts for shake exclusion.
    if (this.freefallStart != null && t - this.freefallStart >= c.freefallMinMs) this.lastFreefallAt = t;

    if (t < this.cooldownUntil) return null;

    const fallEvent = this.stepFall(t, g, freefallJustEnded);
    if (fallEvent) return this.fire(fallEvent);

    // Don't look for a shake while a fall sequence is in progress.
    if (this.fall.s !== "idle") return null;
    const shakeEvent = this.stepShake(t, dyn);
    if (shakeEvent) return this.fire(shakeEvent);
    return null;
  }

  private fire(e: MotionEvent): MotionEvent {
    this.lastDecision = e.type === "fall" ? `fall (impact ${e.impactG} g)` : `shake (${e.peaks} peaks)`;
    this.cooldownUntil = e.t + this.c.cooldownMs;
    this.reset();
    return e;
  }

  private stepFall(t: number, g: number, freefallJustEnded: boolean): MotionEvent | null {
    const c = this.c;
    const f = this.fall;
    switch (f.s) {
      case "idle":
        if (freefallJustEnded) {
          this.fall = { s: "armed", freefallEnd: t };
          return this.stepFall(t, g, false); // the impact may be this very sample
        }
        return null;
      case "armed":
        if (g > c.impactG) {
          this.fall = { s: "settling", impactAt: t, impactG: g };
          this.lastDecision = "fall path: impact, waiting for stillness";
        } else if (t - f.freefallEnd > c.impactWindowMs) {
          this.fall = { s: "idle" };
        }
        return null;
      case "settling":
        if (g > f.impactG) f.impactG = g; // track the peak of the impact/bounce
        if (t - f.impactAt >= c.settleMs) this.fall = { s: "still", impactG: f.impactG, stillSince: t };
        return null;
      case "still":
        if (Math.abs(g - 1) > c.stillToleranceG) {
          this.fall = { s: "idle" }; // moved again → picked up / got up / it was a bump
          this.lastDecision = "fall path: moved again → no fall";
          return null;
        }
        if (t - f.stillSince >= c.stillMs) {
          return { type: "fall", t, impactG: Math.round(f.impactG * 10) / 10 };
        }
        return null;
    }
  }

  private stepShake(t: number, g: number): MotionEvent | null {
    const c = this.c;
    if (g < c.shakeResetG) this.peakArmed = true;
    if (g > c.shakePeakG && this.peakArmed) {
      const last = this.peaks[this.peaks.length - 1];
      if (last !== undefined && t - last > c.shakeMaxPeakGapMs) {
        this.peaks = [t]; // too slow to be a shake (e.g. walking steps) → start over
        this.peakArmed = false;
      } else if (last === undefined || t - last >= c.shakeMinPeakGapMs) {
        this.peaks.push(t);
        this.peakArmed = false;
      }
    }
    this.peaks = this.peaks.filter((p) => t - p <= c.shakeWindowMs);
    if (this.peaks.length >= c.shakePeaks) {
      if (t - this.lastFreefallAt <= c.shakeWindowMs) {
        this.lastDecision = "shake ignored: free-fall in window";
        this.peaks = []; // a free-fall phase in the window → not a deliberate shake
        return null;
      }
      return { type: "shake", t, peaks: this.peaks.length };
    }
    return null;
  }
}
