"use client";

import { useEffect, useRef, useState } from "react";
import { MotionDetector, type MotionEvent } from "@/lib/detection/motion";
import { ActivityMonitor, type ActivityEvent, type MotionState } from "@/lib/detection/activity";

export interface MotionHandle {
  /** True if the device moved since the last call (for the heartbeat's last_motion_at). */
  takeMoved: () => boolean;
  /** Current activity state ("moving" / "still" / "lying"), null until enough samples. */
  motionState: () => MotionState | null;
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
  const [handle] = useState<MotionHandle>(() => ({
    takeMoved: () => detector.takeMoved(),
    motionState: () => activity.current,
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
    const onMotion = (ev: DeviceMotionEvent) => {
      const a = ev.accelerationIncludingGravity;
      if (!a || a.x == null || a.y == null || a.z == null) return;
      const sample = { t: ev.timeStamp || performance.now(), x: a.x, y: a.y, z: a.z };
      const e = detector.push(sample);
      if (e) onEventRef.current(e);
      for (const ae of activity.push(sample)) onActivityRef.current?.(ae);
    };
    window.addEventListener("devicemotion", onMotion);
    return () => window.removeEventListener("devicemotion", onMotion);
  }, [enabled, detector, activity]);

  return handle;
}
