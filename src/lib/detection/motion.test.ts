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

// ── Realistic hand shakes (J's phone: 1.6–3 g total, peaks 150–350 ms apart, 3–4 shakes in ~1.5 s) ──

/** A wrist flick: smooth travel, then a sharp stop (narrow peak) at each end of the stroke, plus noise. */
function handShake(tl: Timeline, opts: { hz: number; amp: number; axis: [number, number, number]; shakes: number; seed?: number }) {
  const r = rng(opts.seed ?? 11);
  const dur = (opts.shakes / opts.hz) * 1000;
  return tl.add(dur, (_t, l) => {
    const ph = ((l * opts.hz) / 1000) % 1;
    const sgn = ph < 0.5 ? 1 : -1;
    const p = (ph % 0.5) / 0.5;
    const a = sgn * (p > 0.8 ? opts.amp * Math.sin((Math.PI * (p - 0.8)) / 0.2) : -0.35 * Math.sin((Math.PI * p) / 0.8));
    const [ax, ay, az] = opts.axis;
    return [ax * a + r() * 0.08, ay * a + r() * 0.08, 1 + az * a + r() * 0.08];
  });
}

const REAL_SHAKES: [string, { hz: number; amp: number; axis: [number, number, number] }][] = [
  ["side to side, firm 1.6 g at 2.5 Hz (was missed: total peaks only 1.84 g)", { hz: 2.5, amp: 1.6, axis: [1, 0, 0] }],
  ["side to side, 1.4 g sine-like at 3 Hz", { hz: 3, amp: 1.4, axis: [1, 0, 0] }],
  ["up and down, 2.5 g at 2 Hz (was missed: every other stroke against gravity)", { hz: 2, amp: 2.5, axis: [0, 0, 1] }],
  ["diagonal, 2.5 g at 2 Hz (was missed)", { hz: 2, amp: 2.5, axis: [0.7, 0, 0.7] }],
  ["diagonal, 2 g at 3 Hz", { hz: 3, amp: 2, axis: [0.7, 0, 0.7] }],
  ["forward and back (y), 1.8 g at 3.5 Hz", { hz: 3.5, amp: 1.8, axis: [0, 1, 0] }],
];
for (const [name, o] of REAL_SHAKES) {
  test(`real shake: ${name} → shake`, () => {
    const tl = new Timeline().still(800);
    handShake(tl, { ...o, shakes: 4 });
    tl.still(1500);
    const events = run(tl.samples);
    assert.equal(events.length, 1, JSON.stringify(events));
    assert.equal(events[0].type, "shake");
  });
}

test("only two shakes → nothing (needs 3–4)", () => {
  const tl = new Timeline().still(800);
  handShake(tl, { hz: 3, amp: 2, axis: [1, 0, 0], shakes: 1 }); // one back-and-forth = 2 stops
  tl.still(3000);
  assert.deepEqual(run(tl.samples), []);
});

test("picking the phone up from the table (flat → upright, lifted) → nothing", () => {
  const tl = new Timeline().still(1000);
  tl.add(500, (_t, l) => {
    const th = (Math.PI / 2) * Math.min(1, l / 400); // rotate 90° in 0.4 s
    const lift = 0.4 * Math.sin((Math.PI * l) / 500);
    return [0, Math.sin(th), Math.cos(th) + lift];
  });
  tl.add(4000, () => [0, 1, 0]);
  assert.deepEqual(run(tl.samples), []);
});

test("putting the phone down firmly on the table → nothing", () => {
  const tl = new Timeline()
    .add(1000, () => [0, 1, 0])
    .add(400, (_t, l) => {
      const th = (Math.PI / 2) * (1 - l / 400);
      return [0, Math.sin(th), Math.cos(th)];
    })
    .add(40, () => [0.2, 0.1, 2.6]) // thud
    .still(4000);
  assert.deepEqual(run(tl.samples), []);
});

test("walking while turning the phone over in the hand → nothing", () => {
  const tl = new Timeline();
  walking(tl, 20_000, { bounce: 0.45, heel: 1.0, seed: 5 });
  // rotate gravity slowly between z and x during the walk
  tl.samples = tl.samples.map((s) => {
    const th = (Math.PI / 2) * (0.5 + 0.5 * Math.sin(s.t / 2000));
    return { ...s, x: s.x * Math.cos(th) + s.z * Math.sin(th), z: -s.x * Math.sin(th) + s.z * Math.cos(th) };
  });
  assert.deepEqual(run(tl.samples), []);
});

test("gentle wave (0.8 g) → nothing", () => {
  const tl = new Timeline().still(500).add(3000, (_t, l) => [0.8 * Math.sin((2 * Math.PI * 2 * l) / 1000), 0, 1]).still(1000);
  assert.deepEqual(run(tl.samples), []);
});

test("debug(): live peak g, peaks in the window, last decision", () => {
  const d = new MotionDetector();
  const tl = new Timeline().still(800);
  handShake(tl, { hz: 3, amp: 2, axis: [1, 0, 0], shakes: 4 });
  let seen = 0;
  for (const s of tl.samples) {
    d.push(s);
    seen = Math.max(seen, d.debug().peaks);
  }
  assert.ok(seen >= 2);
  assert.ok(d.debug().peakG > 1.5, `peak ${d.debug().peakG}`);
  assert.match(d.debug().decision, /^shake \(\d peaks\)$/);
});

// ── iOS / iPadOS specifics ──

test("iOS: inverted axis signs (flat face up reads z = −9.8) → shake and fall still detected", () => {
  const flip = (ss: MotionSample[]) => ss.map((s) => ({ ...s, x: -s.x, y: -s.y, z: -s.z }));
  const shake = new Timeline().still(800);
  handShake(shake, { hz: 3, amp: 2, axis: [0.7, 0, 0.7], shakes: 4 });
  assert.deepEqual(run(flip(shake.samples)).map((e) => e.type), ["shake"]);
  const drop = new Timeline().still(1000).add(400, () => [0, 0, 0.08]).add(50, () => [0.4, 0.2, 3.4]).still(4500);
  assert.deepEqual(run(flip(drop.samples)).map((e) => e.type), ["fall"]);
});

test("iOS: events delivered in bursts with the same timestamp → shake still detected", () => {
  const tl = new Timeline().still(800);
  handShake(tl, { hz: 3, amp: 1.8, axis: [1, 0, 0], shakes: 4 });
  tl.still(1000);
  // pairs of samples share a timestamp (batched delivery)
  const batched = tl.samples.map((s, i) => ({ ...s, t: tl.samples[i - (i % 2)].t }));
  assert.deepEqual(run(batched).map((e) => e.type), ["shake"]);
});

test("a browser reporting g instead of m/s² → detected the same", () => {
  const toG = (ss: MotionSample[]) => ss.map((s) => ({ ...s, x: s.x / G, y: s.y / G, z: s.z / G }));
  const shake = new Timeline().still(800);
  handShake(shake, { hz: 2.5, amp: 1.6, axis: [1, 0, 0], shakes: 4 });
  assert.deepEqual(run(toG(shake.samples)).map((e) => e.type), ["shake"]);
  const drop = new Timeline().still(1000).add(400, () => [0, 0, 0.08]).add(50, () => [0.4, 0.2, 3.4]).still(4500);
  assert.deepEqual(run(toG(drop.samples)).map((e) => e.type), ["fall"]);
  const walk = new Timeline();
  walking(walk, 20_000);
  assert.deepEqual(run(toG(walk.samples)), []);
});
