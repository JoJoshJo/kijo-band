// On-device activity monitoring for the band (pure, unit-tested). Feed it the same DeviceMotion
// `accelerationIncludingGravity` samples (m/s²) as MotionDetector.
//
// State:      "moving" (sustained dynamic acceleration) / "lying" (still, band flat — wrist resting on the
//             bed) / "still" (still, band upright). A new state must hold STATE_HOLD_MS before it shows.
// Inactivity: no "moving" for inactivityMs → one event; re-armed by the next movement.
// Up at night: lying for ≥ LYING_MIN_MS, then within UP_WINDOW_MS the band turns upright AND the resident
//             walks (≥ WALK_MIN_STEPS step-like peaks) → one event, then quiet for UP_DEBOUNCE_MS.
//             Picking the phone up once (one movement, no walking rhythm) does not count.

import { G, type MotionSample } from "./motion";

export type MotionState = "moving" | "still" | "lying";
export const MOTION_STATES: readonly MotionState[] = ["moving", "still", "lying"];

/** Inactivity alert after this long without movement. Demo: 1 min. Real product: 10 min. */
export const INACTIVITY_MS_DEMO = 60_000;
export const INACTIVITY_MS_REAL = 10 * 60_000;
export const INACTIVITY_MS = INACTIVITY_MS_DEMO;

export const LYING_MIN_MS = 20_000;
export const UP_WINDOW_MS = 30_000;
export const UP_DEBOUNCE_MS = 10 * 60_000;

const WINDOW_MS = 2000; // dynamic-acceleration window
const MOVING_STD_G = 0.08; // std of |a| over the window; walking ≈ 0.15–0.4 g, resting ≈ 0.01 g
const STATE_HOLD_MS = 1000;
const GRAVITY_TAU_MS = 600; // low-pass for the gravity direction
const FLAT_RATIO = 0.85; // |g_z| / |g| above this → band flat (≈ within 32° of horizontal)
const UPRIGHT_RATIO = 0.6; // below this → band upright
const STEP_HIGH_G = 1.12;
const STEP_LOW_G = 1.03;
const STEP_MIN_GAP_MS = 300; // ≤ 200 steps/min
const STEP_MAX_GAP_MS = 1300; // ≥ 46 steps/min
const WALK_WINDOW_MS = 6000;
const WALK_MIN_STEPS = 5;

export type ActivityEvent =
  | { type: "state"; state: MotionState }
  | { type: "inactivity"; stillForMs: number }
  | { type: "up_at_night" };

export interface ActivityOptions {
  inactivityMs?: number;
}

export class ActivityMonitor {
  private readonly inactivityMs: number;
  private win: { t: number; m: number }[] = [];
  private grav: [number, number, number] | null = null;
  private lastT: number | null = null;

  private state: MotionState | null = null;
  private candidate: MotionState | null = null;
  private candidateSince = 0;

  private lastMovementAt: number | null = null;
  private inactivityFired = false;

  private lyingSince: number | null = null;
  private upArmedUntil = -Infinity;
  private lastUpAt = -Infinity;

  private stepHigh = false;
  private steps: number[] = [];

  constructor(opts: ActivityOptions = {}) {
    this.inactivityMs = opts.inactivityMs ?? INACTIVITY_MS;
  }

  get current(): MotionState | null {
    return this.state;
  }

  reset() {
    Object.assign(this, new ActivityMonitor({ inactivityMs: this.inactivityMs }));
  }

  push(s: MotionSample): ActivityEvent[] {
    if (![s.t, s.x, s.y, s.z].every(Number.isFinite)) return [];
    if (this.lastT != null && s.t <= this.lastT) return [];
    const dt = this.lastT == null ? 0 : s.t - this.lastT;
    this.lastT = s.t;
    this.lastMovementAt ??= s.t;

    const gx = s.x / G, gy = s.y / G, gz = s.z / G;
    const mag = Math.hypot(gx, gy, gz);

    // Gravity direction (low-pass).
    if (!this.grav) this.grav = [gx, gy, gz];
    else {
      const a = dt / (GRAVITY_TAU_MS + dt);
      this.grav = [this.grav[0] + a * (gx - this.grav[0]), this.grav[1] + a * (gy - this.grav[1]), this.grav[2] + a * (gz - this.grav[2])];
    }
    const gmag = Math.hypot(...this.grav) || 1;
    const flatRatio = Math.abs(this.grav[2]) / gmag;

    // Dynamic acceleration over the last 2 s.
    this.win.push({ t: s.t, m: mag });
    while (this.win.length && this.win[0].t < s.t - WINDOW_MS) this.win.shift();
    const mean = this.win.reduce((a, w) => a + w.m, 0) / this.win.length;
    const std = Math.sqrt(this.win.reduce((a, w) => a + (w.m - mean) ** 2, 0) / this.win.length);

    // Steps: peaks of |a| with hysteresis and a walking-cadence gap.
    if (!this.stepHigh && mag > STEP_HIGH_G) {
      this.stepHigh = true;
      const last = this.steps[this.steps.length - 1];
      if (last == null || s.t - last >= STEP_MIN_GAP_MS) this.steps.push(s.t);
    } else if (this.stepHigh && mag < STEP_LOW_G) {
      this.stepHigh = false;
    }
    while (this.steps.length && this.steps[0] < s.t - WALK_WINDOW_MS) this.steps.shift();

    const events: ActivityEvent[] = [];
    const warm = this.win.length > 1 && s.t - this.win[0].t >= WINDOW_MS * 0.75;
    if (!warm) return events;

    const raw: MotionState = std > MOVING_STD_G ? "moving" : flatRatio >= FLAT_RATIO ? "lying" : "still";
    if (raw !== this.candidate) {
      this.candidate = raw;
      this.candidateSince = s.t;
    }
    if (raw !== this.state && s.t - this.candidateSince >= STATE_HOLD_MS) {
      const prev = this.state;
      this.state = raw;
      events.push({ type: "state", state: raw });
      if (raw === "lying") this.lyingSince = this.candidateSince;
      if (prev === "lying" && this.lyingSince != null && this.candidateSince - this.lyingSince >= LYING_MIN_MS) {
        this.upArmedUntil = s.t + UP_WINDOW_MS; // got up after lying down for a while: watch for walking
      }
      if (raw !== "lying") this.lyingSince = null;
    }

    if (raw === "moving") {
      this.lastMovementAt = s.t;
      this.inactivityFired = false;
    } else if (!this.inactivityFired && s.t - this.lastMovementAt >= this.inactivityMs) {
      this.inactivityFired = true;
      events.push({ type: "inactivity", stillForMs: s.t - this.lastMovementAt });
    }

    if (s.t <= this.upArmedUntil && flatRatio < UPRIGHT_RATIO && this.isWalking() && s.t - this.lastUpAt >= UP_DEBOUNCE_MS) {
      this.lastUpAt = s.t;
      this.upArmedUntil = -Infinity;
      events.push({ type: "up_at_night" });
    }
    return events;
  }

  /** ≥ WALK_MIN_STEPS peaks in the last 6 s with walking-cadence gaps. */
  private isWalking(): boolean {
    if (this.steps.length < WALK_MIN_STEPS) return false;
    let run = 1;
    for (let i = 1; i < this.steps.length; i++) {
      const gap = this.steps[i] - this.steps[i - 1];
      run = gap <= STEP_MAX_GAP_MS ? run + 1 : 1;
      if (run >= WALK_MIN_STEPS) return true;
    }
    return false;
  }
}
