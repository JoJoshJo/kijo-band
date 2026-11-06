// Run: npx tsx --test src/lib/detection/*.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { G, MotionDetector, type MotionEvent, type MotionSample } from "./motion";

const HZ = 60;
const DT = 1000 / HZ;

/** Deterministic noise so tests are repeatable. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32) * 2 - 1;
}

/** Build samples from a function of time (ms) returning [x, y, z] in g. */
function gen(startMs: number, durMs: number, f: (t: number) => [number, number, number]): MotionSample[] {
  const out: MotionSample[] = [];
  for (let t = startMs; t < startMs + durMs; t += DT) {
    const [x, y, z] = f(t);
    out.push({ t, x: x * G, y: y * G, z: z * G });
  }
  return out;
}

class Timeline {
  samples: MotionSample[] = [];
  t = 0;
  add(durMs: number, f: (t: number, local: number) => [number, number, number]) {
    const start = this.t;
    this.samples.push(...gen(start, durMs, (t) => f(t, t - start)));
    this.t = start + Math.ceil(durMs / DT) * DT;
    return this;
  }
  still(durMs: number, noise = 0.02, seed = 1) {
    const r = rng(seed);
    return this.add(durMs, () => [r() * noise, r() * noise, 1 + r() * noise]);
  }
}

function run(samples: MotionSample[]): MotionEvent[] {
  const d = new MotionDetector();
  const events: MotionEvent[] = [];
  for (const s of samples) {
    const e = d.push(s);
    if (e) events.push(e);
  }
  return events;
}

/** Arm-swing walking: vertical bounce ±0.35 g at ~1.8 steps/s with heel-strike spikes and noise. */
function walking(tl: Timeline, durMs: number, opts: { bounce?: number; heel?: number; seed?: number } = {}) {
  const bounce = opts.bounce ?? 0.35;
  const heel = opts.heel ?? 0.5;
  const r = rng(opts.seed ?? 7);
  const stepHz = 1.8;
  return tl.add(durMs, (_t, local) => {
    const phase = (local / 1000) * stepHz;
    const frac = phase - Math.floor(phase);
    const strike = frac < 0.05 ? heel : 0; // short heel-strike spike each step
    const v = 1 + bounce * Math.sin(2 * Math.PI * phase) + strike + r() * 0.05;
    const swing = 0.3 * Math.sin(Math.PI * phase); // arm swing on another axis
    return [swing + r() * 0.05, r() * 0.05, v];
  });
}

// ── Falls ──

test("drop onto a pillow → fall after ~3.5s of stillness", () => {
  const tl = new Timeline()
    .still(1000)
    .add(400, () => [0.02, 0.01, 0.08]) // free-fall ~0.8 m
    .add(50, () => [0.4, 0.2, 3.4]) // impact
    .add(300, (_t, l) => [0, 0, 1 + 0.4 * Math.sin(l / 30)]) // bounce on the pillow
    .still(4000);
  const events = run(tl.samples);
  assert.equal(events.length, 1);
  assert.equal(events[0].type, "fall");
  const fallAt = events[0].t;
  // impact at ~1400ms + 500ms settle + 3000ms still
  assert.ok(fallAt > 4800 && fallAt < 5200, `fall at ${fallAt}`);
});

test("drop then picked up within 3s → no fall", () => {
  const tl = new Timeline()
    .still(1000)
    .add(400, () => [0, 0, 0.05])
    .add(50, () => [0, 0, 3.2])
    .still(1500)
    .add(800, (_t, l) => [0.6 * Math.sin(l / 80), 0, 1 + 0.5 * Math.sin(l / 60)]) // picked up
    .still(4000);
  assert.deepEqual(run(tl.samples), []);
});

test("free-fall without a hard impact (caught softly) → no fall", () => {
  const tl = new Timeline()
    .still(500)
    .add(300, () => [0, 0, 0.1])
    .add(200, () => [0, 0, 1.6]) // soft catch, < 2.5 g
    .still(5000);
  assert.deepEqual(run(tl.samples), []);
});

test("impact more than 1s after free-fall → no fall", () => {
  const tl = new Timeline()
    .still(500)
    .add(300, () => [0, 0, 0.1])
    .still(1200)
    .add(50, () => [0, 0, 3.5])
    .still(5000);
  const events = run(tl.samples);
  assert.ok(!events.some((e) => e.type === "fall"));
});

// ── Normal life must not trigger ──

test("normal walking for 60s → nothing", () => {
  const tl = new Timeline();
  walking(tl, 60_000);
  assert.deepEqual(run(tl.samples), []);
});

test("brisk walking with hard heel strikes (peaks ~2.1 g) → nothing", () => {
  const tl = new Timeline();
  walking(tl, 30_000, { bounce: 0.45, heel: 1.1, seed: 3 });
  const max = Math.max(...tl.samples.map((s) => Math.hypot(s.x, s.y, s.z) / G));
  assert.ok(max > 2, `test should include >2 g peaks, max ${max.toFixed(2)}`);
  assert.deepEqual(run(tl.samples), []);
});

test("single bump on a table (spike + ringing) → nothing", () => {
  const tl = new Timeline()
    .still(1000)
    .add(30, () => [0.5, 0.3, 3.2])
    .add(40, () => [0, 0, 0.7])
    .add(30, () => [0.2, 0, 2.3]) // ringing
    .still(5000);
  assert.deepEqual(run(tl.samples), []);
});

test("two bumps 0.5s apart → nothing (needs 3 peaks)", () => {
  const tl = new Timeline()
    .still(500)
    .add(30, () => [0, 0, 2.8])
    .still(470)
    .add(30, () => [0, 0, 2.8])
    .still(3000);
  assert.deepEqual(run(tl.samples), []);
});

test("sitting down hard in a chair → nothing", () => {
  const tl = new Timeline()
    .still(1000)
    .add(250, () => [0, 0, 0.75]) // lowering, not free-fall
    .add(60, () => [0.2, 0, 2.2])
    .still(5000);
  assert.deepEqual(run(tl.samples), []);
});

// ── Shake SOS ──

test("vigorous side-to-side shake (~4 Hz) → shake", () => {
  const tl = new Timeline().still(500).add(1500, (_t, l) => [2.2 * Math.sin((2 * Math.PI * 4 * l) / 1000), 0, 1]);
  const events = run(tl.samples);
  assert.equal(events.length, 1);
  assert.equal(events[0].type, "shake");
});

test("up-and-down shake along gravity (brief dips < 0.5 g) → shake", () => {
  const tl = new Timeline().still(500).add(1500, (_t, l) => [0, 0, 1 + 1.8 * Math.sin((2 * Math.PI * 4 * l) / 1000)]);
  const events = run(tl.samples);
  assert.equal(events.length, 1);
  assert.equal(events[0].type, "shake");
});

test("continuous shaking for 5s → one alert, then cooldown", () => {
  const tl = new Timeline().still(200).add(5000, (_t, l) => [2.4 * Math.sin((2 * Math.PI * 4 * l) / 1000), 0, 1]);
  const events = run(tl.samples);
  assert.ok(events.length >= 1 && events.length <= 2, `got ${events.length}`);
  assert.ok(events.every((e) => e.type === "shake"));
});

test("tumble with free-fall then repeated impacts → not reported as a shake", () => {
  const tl = new Timeline()
    .still(500)
    .add(300, () => [0, 0, 0.05])
    .add(40, () => [0, 0, 3])
    .add(150, () => [0, 0, 1])
    .add(40, () => [0, 0, 2.6])
    .add(150, () => [0, 0, 1])
    .add(40, () => [0, 0, 2.4])
    .add(1000, (_t, l) => [0.5 * Math.sin(l / 50), 0, 1]); // keeps moving → no fall either
  assert.ok(!run(tl.samples).some((e) => e.type === "shake"));
});

test("ignores samples with missing values", () => {
  const d = new MotionDetector();
  assert.equal(d.push({ t: 0, x: NaN, y: 0, z: G }), null);
});

test("takeMoved reports movement once", () => {
  const d = new MotionDetector();
  for (const s of new Timeline().still(500).samples) d.push(s);
  assert.equal(d.takeMoved(), false);
  d.push({ t: 600, x: 0, y: 0, z: 1.5 * G });
  assert.equal(d.takeMoved(), true);
  assert.equal(d.takeMoved(), false);
});
