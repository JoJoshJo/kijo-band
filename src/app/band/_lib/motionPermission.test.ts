// Run: npx tsx --test src/app/band/_lib/motionPermission.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { motionAllowed, requestMotionPermission } from "./useMotionDetection";

const g = globalThis as unknown as { window?: object; DeviceMotionEvent?: unknown };
function withDME(dme: unknown, fn: () => Promise<void>) {
  return async () => {
    const saved = { window: g.window, DME: g.DeviceMotionEvent };
    g.window = {};
    g.DeviceMotionEvent = dme;
    try {
      await fn();
    } finally {
      g.window = saved.window;
      g.DeviceMotionEvent = saved.DME;
    }
  };
}

test("Android / desktop (no requestPermission) → not-needed, allowed", withDME(function DME() {}, async () => {
  const p = await requestMotionPermission();
  assert.equal(p, "not-needed");
  assert.ok(motionAllowed(p));
}));

test("iOS / iPadOS granted → granted (feature detection, no user agent)", withDME({ requestPermission: async () => "granted" }, async () => {
  assert.equal(await requestMotionPermission(), "granted");
}));

test("iOS denied → denied, not allowed", withDME({ requestPermission: async () => "denied" }, async () => {
  const p = await requestMotionPermission();
  assert.equal(p, "denied");
  assert.ok(!motionAllowed(p));
}));

test("iOS rejects (called outside a tap) → error with the reason, not allowed", withDME({
  requestPermission: () => Promise.reject(Object.assign(new Error("requires a user gesture"), { name: "NotAllowedError" })),
}, async () => {
  const p = await requestMotionPermission();
  assert.equal(p, "error: NotAllowedError");
  assert.ok(!motionAllowed(p));
}));

test("requestPermission is called synchronously (before the first await)", withDME(undefined, async () => {
  let called = false;
  g.DeviceMotionEvent = { requestPermission: () => ((called = true), Promise.resolve("granted")) };
  const pending = requestMotionPermission();
  assert.ok(called, "called during the tap, not later");
  assert.equal(await pending, "granted");
}));
