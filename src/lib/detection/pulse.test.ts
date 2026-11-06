import { test } from "node:test";
import assert from "node:assert/strict";
import { estimateBpm, fingerCovered, type PulseSample } from "./pulse";

// Deterministic PRNG so the tests never flake.
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

/**
 * Synthetic fingertip PPG: bright red baseline (torch through skin), a slow drift from finger pressure /
 * auto-exposure, a pulse wave with a harmonic (sharp systolic upstroke), sensor noise, and frame times
 * with jitter like a real phone camera (~30 fps).
 */
function ppg(opts: {
  bpm: number | ((tSec: number) => number);
  seconds?: number;
  fps?: number;
  amp?: number;
  noise?: number;
  seed?: number;
}): PulseSample[] {
  const { seconds = 15, fps = 30, amp = 1.5, noise = 0.25, seed = 1 } = opts;
  const rand = rng(seed);
  const out: PulseSample[] = [];
  let phase = 0;
  let t = 0;
  let prev = 0;
  while (t < seconds * 1000) {
    const sec = t / 1000;
    const bpm = typeof opts.bpm === "function" ? opts.bpm(sec) : opts.bpm;
    phase += 2 * Math.PI * (bpm / 60) * ((t - prev) / 1000);
    prev = t;
    const wave = Math.sin(phase) + 0.35 * Math.sin(2 * phase + 0.8);
    const drift = 6 * sec / seconds + 2 * Math.sin(2 * Math.PI * 0.08 * sec);
    out.push({ t, v: 180 + drift + amp * wave + noise * (rand() * 2 - 1) });
    t += 1000 / fps + (rand() - 0.5) * 8; // ±4 ms frame jitter
  }
  return out;
}

test("synthetic 72 bpm → 72 ± 2", () => {
  const r = estimateBpm(ppg({ bpm: 72 }));
  assert.ok(r.ok, `expected success, got ${JSON.stringify(r)}`);
  assert.ok(Math.abs(r.bpm - 72) <= 2, `bpm ${r.bpm}`);
  assert.ok(r.quality > 0.7, `quality ${r.quality}`);
});

test("works across the range (48, 95, 140 bpm)", () => {
  for (const bpm of [48, 95, 140]) {
    const r = estimateBpm(ppg({ bpm, seed: bpm }));
    assert.ok(r.ok, `bpm ${bpm}: ${JSON.stringify(r)}`);
    assert.ok(Math.abs(r.bpm - bpm) <= 3, `expected ${bpm}, got ${r.bpm}`);
  }
});

test("lower frame rate (iPhone without torch ~24 fps, weak signal) still reads 72", () => {
  const r = estimateBpm(ppg({ bpm: 72, fps: 24, amp: 0.5, noise: 0.12, seed: 7 }));
  assert.ok(r.ok && Math.abs(r.bpm - 72) <= 3, JSON.stringify(r));
});

test("no finger / flat signal → no_signal", () => {
  const r = estimateBpm(ppg({ bpm: 72, amp: 0, noise: 0.01 }));
  assert.equal(r.ok, false);
});

test("moving hand (big random jumps) → rejected", () => {
  const rand = rng(3);
  const samples = ppg({ bpm: 72 }).map((s) => ({ ...s, v: s.v + (rand() < 0.08 ? (rand() - 0.5) * 60 : 0) }));
  // Smear each jump over a few frames like real motion.
  const r = estimateBpm(samples);
  assert.equal(r.ok, false, JSON.stringify(r));
});

test("rhythm that changes wildly mid-reading → unstable", () => {
  const r = estimateBpm(ppg({ bpm: (s) => (s < 7 ? 55 : 130), seed: 5 }));
  assert.equal(r.ok, false, JSON.stringify(r));
});

test("too short (5 s) → too_short", () => {
  const r = estimateBpm(ppg({ bpm: 72, seconds: 5 }));
  assert.deepEqual(r.ok ? null : r.reason, "too_short");
});

test("fingerCovered: red-dominant frame yes, normal scene no", () => {
  assert.equal(fingerCovered(200, 40, 30), true);
  assert.equal(fingerCovered(120, 110, 100), false);
  assert.equal(fingerCovered(10, 2, 2), false); // too dark
});
