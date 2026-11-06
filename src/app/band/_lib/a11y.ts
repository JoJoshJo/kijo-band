"use client";

import { useCallback, useSyncExternalStore } from "react";

// ── prefers-reduced-motion ──
const REDUCED = "(prefers-reduced-motion: reduce)";
function subscribeReduced(cb: () => void) {
  const mq = window.matchMedia(REDUCED);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}
export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribeReduced, () => window.matchMedia(REDUCED).matches, () => false);
}

// ── Large text (remembered on this phone) ──
const LARGE_TEXT_KEY = "kijo-band-large-text";
const LARGE_TEXT_EVENT = "kijo-band-large-text";
function readLargeText(): boolean {
  try {
    return localStorage.getItem(LARGE_TEXT_KEY) === "1";
  } catch {
    return false;
  }
}
function subscribeLargeText(cb: () => void) {
  window.addEventListener(LARGE_TEXT_EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(LARGE_TEXT_EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}
export function useLargeText(): [boolean, (on: boolean) => void] {
  const on = useSyncExternalStore(subscribeLargeText, readLargeText, () => false);
  const set = useCallback((v: boolean) => {
    try {
      if (v) localStorage.setItem(LARGE_TEXT_KEY, "1");
      else localStorage.removeItem(LARGE_TEXT_KEY);
    } catch {
      // Private mode etc.: applies until reload.
    }
    window.dispatchEvent(new Event(LARGE_TEXT_EVENT));
  }, []);
  return [on, set];
}

/** Visible keyboard / switch-access focus ring for every band control (4px brand teal, offset from the button). */
export const FOCUS =
  "focus-visible:outline-solid focus-visible:outline-4 focus-visible:outline-offset-4 focus-visible:outline-brand";

/** One icon scale for the band (Phosphor fill): inline 24 · top bar 30 · headings 32 · quick cards 36. */
export const ICON = { inline: 24, bar: 30, heading: 32, card: 36 } as const;
