// Run: npx tsx --test src/lib/detection/*.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { G, type MotionSample } from "./motion";
import { ActivityMonitor, INACTIVITY_MS_REAL, type ActivityEvent } from "./activity";

const HZ = 50;
const DT = 1000 / HZ;

function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32) * 2 - 1;
}

type Vec = [number, number, number];

/** Builds a sample stream segment by segment; vectors are in g. */
class Timeline {
  samples: MotionSample[] = [];
  t = 0;
  private r = rng(11);
  add(ms: number, f: (local: number) => Vec) {
    for (let local = 0; local < ms; local += DT) {
      const [x, y, z] = f(local);
      const n = () => this.r() * 0.01;
      this.samples.push({ t: this.t + local, x: (x + n()) * G, y: (y + n()) * G, z: (z + n()) * G });
    }
    this.t += Math.ceil(ms / DT) * DT;
    return this;
  }
  /** Wrist resting flat (in bed / phone on a table). */
  lying(ms: number) {
    return this.add(ms, () => [0, 0, 1]);
  }
  /** Arm hanging or sitting still: band upright. */
  stillUpright(ms: number) {
    return this.add(ms, () => [0, 1, 0]);
  }
  /** Walking, band upright: ~1.8 steps/s bounce + arm sway. */
  walk(ms: number, cadenceHz = 1.8) {
    return this.add(ms, (l) => {
      const p = 2 * Math.PI * cadenceHz * (l / 1000);
      const bounce = 0.35 * Math.max(0, Math.sin(p)) ** 2 - 0.1;
      return [0.15 * Math.sin(p / 2), 1 + bounce, 0.1 * Math.cos(p / 2)];
    });
  }
  /** Sitting up / getting out of bed: rotate flat → upright over 2 s with some jerk. */
  getUp() {
    return this.add(2000, (l) => {
      const k = Math.min(1, l / 1500);
      const a = (k * Math.PI) / 2;
      const jerk = 0.3 * Math.sin((2 * Math.PI * l) / 400) * (1 - k);
      return [0, Math.sin(a) * (1 + jerk), Math.cos(a) * (1 + jerk)];
    });
  }
  /** Picked up once from flat, looked at (upright-ish, hand tremor), put back down. */
  pickUpOnce() {
    this.getUp();
    this.add(3000, (l) => [0.02 * Math.sin(l / 70), 0.8, 0.6]);
    return this.add(1500, (l) => {
      const k = Math.min(1, l / 1200);
      const a = ((1 - k) * Math.PI) / 2;
      return [0, Math.sin(a), Math.cos(a)];
    });
  }
  /** Arm moving in bed: a couple of seconds of motion, band stays roughly flat. */
  armInBed(ms = 2000) {
    return this.add(ms, (l) => [0.4 * Math.sin(l / 120), 0.2 * Math.sin(l / 90), 1 + 0.3 * Math.sin(l / 60)]);
  }
}

function run(tl: Timeline, opts?: ConstructorParameters<typeof ActivityMonitor>[0]) {
  const m = new ActivityMonitor(opts);
  const events: (ActivityEvent & { at: number })[] = [];
  for (const s of tl.samples) for (const e of m.push(s)) events.push({ ...e, at: s.t });
  return { events, state: m.current, of: (type: ActivityEvent["type"]) => events.filter((e) => e.type === type) };
}

const states = (r: ReturnType<typeof run>) => r.of("state").map((e) => (e.type === "state" ? e.state : ""));

test("state: lying → walking → standing still", () => {
  const r = run(new Timeline().lying(10_000).getUp().walk(10_000).stillUpright(10_000));
  assert.deepEqual(states(r), ["lying", "moving", "still"]);
});

test("normal walking for 3 min: moving, no inactivity, no up-at-night", () => {
  const r = run(new Timeline().walk(180_000));
  assert.equal(r.state, "moving");
  assert.equal(r.of("inactivity").length, 0);
  assert.equal(r.of("up_at_night").length, 0);
});

test("brisk and slow walking also count as moving (no inactivity over 3 min)", () => {
  for (const cadence of [1.2, 2.4]) {
    const r = run(new Timeline().walk(180_000, cadence));
    assert.equal(r.of("inactivity").length, 0, `cadence ${cadence}`);
  }
});

test("inactivity (demo 1 min): fires once at ~60 s, re-arms after movement", () => {
  const tl = new Timeline().lying(5 * 60_000).walk(5000).lying(70_000);
  const r = run(tl);
  const inact = r.of("inactivity");
  assert.equal(inact.length, 2);
  assert.ok(inact[0].at >= 60_000 && inact[0].at < 62_000, `first at ${inact[0].at}`);
});

test("inactivity: phone picked up once resets the timer (50 s + pick-up + 50 s → none)", () => {
  const r = run(new Timeline().lying(50_000).pickUpOnce().lying(50_000));
  assert.equal(r.of("inactivity").length, 0);
});

test("inactivity real value 10 min: 9.5 min still → none, 10.1 min → one", () => {
  assert.equal(run(new Timeline().lying(570_000), { inactivityMs: INACTIVITY_MS_REAL }).of("inactivity").length, 0);
  assert.equal(run(new Timeline().lying(606_000), { inactivityMs: INACTIVITY_MS_REAL }).of("inactivity").length, 1);
});

const quiet = { inactivityMs: 60 * 60_000 }; // isolate up-at-night tests from inactivity

test("up at night: lying 30 s → gets up → walks → one alert", () => {
  const r = run(new Timeline().lying(30_000).getUp().walk(10_000), quiet);
  assert.equal(r.of("up_at_night").length, 1);
});

test("up at night is debounced for 10 min", () => {
  const tl = new Timeline().lying(30_000).getUp().walk(10_000).lying(30_000).getUp().walk(10_000);
  assert.equal(run(tl, quiet).of("up_at_night").length, 1);
  tl.lying(10 * 60_000).getUp().walk(10_000); // after the debounce → fires again
  assert.equal(run(tl, quiet).of("up_at_night").length, 2);
});

test("no up-at-night: phone picked up once from bed and put back", () => {
  const r = run(new Timeline().lying(60_000).pickUpOnce().lying(30_000), quiet);
  assert.equal(r.of("up_at_night").length, 0);
});

test("no up-at-night: arm moving in bed (band stays flat)", () => {
  const r = run(new Timeline().lying(30_000).armInBed(3000).lying(10_000).armInBed(3000), quiet);
  assert.equal(r.of("up_at_night").length, 0);
});

test("no up-at-night: lying only 10 s (< 20 s) before walking", () => {
  const r = run(new Timeline().stillUpright(5000).lying(10_000).getUp().walk(10_000), quiet);
  assert.equal(r.of("up_at_night").length, 0);
});

test("no up-at-night: gets up but only sits (no walking) for the 30 s window", () => {
  const r = run(new Timeline().lying(30_000).getUp().stillUpright(40_000).walk(10_000), quiet);
  assert.equal(r.of("up_at_night").length, 0);
});

test("garbage samples are ignored", () => {
  const m = new ActivityMonitor();
  assert.deepEqual(m.push({ t: 0, x: NaN, y: 0, z: 0 }), []);
  assert.deepEqual(m.push({ t: 1, x: 0, y: 0, z: G }), []);
  assert.deepEqual(m.push({ t: 1, x: 0, y: 0, z: G }), []); // non-increasing time
});
