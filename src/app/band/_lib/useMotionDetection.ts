"use client";

import { useEffect, useRef, useState } from "react";
import { MotionDetector, type MotionEvent } from "@/lib/detection/motion";
import { ActivityMonitor, type ActivityEvent, type MotionState } from "@/lib/detection/activity";

export interface MotionHandle {
  /** True if the device moved since the last call (for the heartbeat's last_motion_at). */
  takeMoved: () => boolean;
  /** Current activity state ("moving" / "still" / "lying"), null until enough samples. */
  motionState: () => MotionState | null;
  /** ?debug=1 only: sample rate, live peak g, peaks in the shake window, last shake/fall decision. */
  debug: () => MotionDebug;
}

export interface MotionDebug {
  /** devicemotion events in the last second (0 = no events: permission denied / unsupported) */
  hz: number;
  /** Listener attached (after Start) */
  attached: boolean;
  peakG: number;
  peaks: number;
  decision: string;
  fall: string;
}

/** Motion permission: "not-needed" (Android, desktop), iOS answers, or why the request failed. */
export type MotionPermission = "unknown" | "pending" | "not-needed" | "granted" | "denied" | `error: ${string}`;

/**
 * Ask for motion access. MUST be called synchronously inside a tap, before any await (iOS and iPadOS
 * reject it otherwise). Feature detection, not the user agent: iPad Safari presents itself as a Mac.
 */
export function requestMotionPermission(): Promise<MotionPermission> {
  if (typeof window === "undefined" || typeof DeviceMotionEvent === "undefined") return Promise.resolve("not-needed");
  const DME = DeviceMotionEvent as unknown as { requestPermission?: () => Promise<PermissionState> };
  if (typeof DME.requestPermission !== "function") return Promise.resolve("not-needed");
  try {
    return DME.requestPermission().then<MotionPermission, MotionPermission>(
      (state) => (state === "granted" ? "granted" : "denied"),
      (err: unknown) => `error: ${err instanceof Error ? err.name : String(err)}`,
    );
  } catch (err) {
    return Promise.resolve<MotionPermission>(`error: ${err instanceof Error ? err.name : String(err)}`);
  }
}

export const motionAllowed = (p: MotionPermission) => p === "granted" || p === "not-needed";

/** Debug only: devicemotion rate and whether the listener is attached. */
class SampleStats {
  private times: number[] = [];
  attached = false;
  setAttached(on: boolean) {
    this.attached = on;
  }
  mark(t: number) {
    this.times.push(t);
    if (this.times.length > 240) this.times.splice(0, this.times.length - 240);
  }
  hz(now: number) {
    return this.times.filter((t) => now - t <= 1000).length;
  }
}

/**
 * Feeds DeviceMotion samples into the fall/shake detector and the activity monitor while `enabled`.
 * onEvent: fall/shake. onActivity: state changes, inactivity, up-at-night.
 */
export function useMotionDetection(
  enabled: boolean,
  onEvent: (e: MotionEvent) => void,
  onActivity?: (e: ActivityEvent) => void,
): MotionHandle {
  const [detector] = useState(() => new MotionDetector());
  const [activity] = useState(() => new ActivityMonitor());
  const [stats] = useState(() => new SampleStats());
  const [handle] = useState<MotionHandle>(() => ({
    takeMoved: () => detector.takeMoved(),
    motionState: () => activity.current,
    debug: () => {
      const now = performance.now();
      return { hz: stats.hz(now), attached: stats.attached, ...detector.debug() };
    },
  }));
  const onEventRef = useRef(onEvent);
  const onActivityRef = useRef(onActivity);
  useEffect(() => {
    onEventRef.current = onEvent;
    onActivityRef.current = onActivity;
  }, [onEvent, onActivity]);

  useEffect(() => {
    if (!enabled || typeof window === "undefined" || !("DeviceMotionEvent" in window)) return;
    detector.reset();
    activity.reset();
    stats.setAttached(true);
    const onMotion = (ev: DeviceMotionEvent) => {
      stats.mark(performance.now());
      const a = ev.accelerationIncludingGravity;
      if (!a || a.x == null || a.y == null || a.z == null) return;
      const sample = { t: ev.timeStamp || performance.now(), x: a.x, y: a.y, z: a.z }; // m/s² (detector checks)
      const e = detector.push(sample);
      if (e) onEventRef.current(e);
      for (const ae of activity.push(sample)) onActivityRef.current?.(ae);
    };
    window.addEventListener("devicemotion", onMotion);
    return () => {
      stats.setAttached(false);
      window.removeEventListener("devicemotion", onMotion);
    };
  }, [enabled, detector, activity, stats]);

  return handle;
}
