"use client";

import { useEffect, useRef, useState } from "react";
import { MotionDetector, type MotionEvent } from "@/lib/detection/motion";

export interface MotionHandle {
  /** True if the device moved since the last call (for the heartbeat's last_motion_at). */
  takeMoved: () => boolean;
}

/** Feeds DeviceMotion samples into the fall/shake detector while `enabled`; calls onEvent on a detection. */
export function useMotionDetection(enabled: boolean, onEvent: (e: MotionEvent) => void): MotionHandle {
  const [detector] = useState(() => new MotionDetector());
  const [handle] = useState<MotionHandle>(() => ({ takeMoved: () => detector.takeMoved() }));
  const onEventRef = useRef(onEvent);
  useEffect(() => {
    onEventRef.current = onEvent;
  }, [onEvent]);

  useEffect(() => {
    if (!enabled || typeof window === "undefined" || !("DeviceMotionEvent" in window)) return;
    detector.reset();
    const onMotion = (ev: DeviceMotionEvent) => {
      const a = ev.accelerationIncludingGravity;
      if (!a || a.x == null || a.y == null || a.z == null) return;
      const e = detector.push({ t: ev.timeStamp || performance.now(), x: a.x, y: a.y, z: a.z });
      if (e) onEventRef.current(e);
    };
    window.addEventListener("devicemotion", onMotion);
    return () => window.removeEventListener("devicemotion", onMotion);
  }, [enabled, detector]);

  return handle;
}
