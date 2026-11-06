"use client";

import { useCallback, useSyncExternalStore } from "react";

// Tiny sessionStorage-backed value (SSR-safe: server snapshot is the fallback).
const listeners = new Set<() => void>();
const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => listeners.delete(cb);
};

export function useSessionValue(key: string, fallback = ""): [string, (v: string) => void] {
  const value = useSyncExternalStore(
    subscribe,
    () => sessionStorage.getItem(key) ?? fallback,
    () => fallback,
  );
  const set = useCallback(
    (v: string) => {
      sessionStorage.setItem(key, v);
      listeners.forEach((l) => l());
    },
    [key],
  );
  return [value, set];
}
