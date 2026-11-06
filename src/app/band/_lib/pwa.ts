"use client";

import { useEffect, useSyncExternalStore } from "react";

// PWA helpers for /band: per-resident manifest, service worker, "Add to Home Screen" hint.

export const STORED_RESIDENT_KEY = "kijo.residentId";
const MANIFEST_PATH = "/band/manifest.webmanifest";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

// ── Install prompt store (Android/Chrome fires beforeinstallprompt once; keep it for our button) ──
let deferredPrompt: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault(); // show our own button instead of the mini-infobar
    deferredPrompt = e as BeforeInstallPromptEvent;
    emit();
  });
  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    emit();
  });
}

export type InstallKind = "standalone" | "prompt" | "ios" | "none";

function installKind(): InstallKind {
  const nav = navigator as Navigator & { standalone?: boolean };
  if (window.matchMedia("(display-mode: standalone)").matches || nav.standalone) return "standalone";
  if (deferredPrompt) return "prompt";
  const ua = navigator.userAgent;
  const iOS = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  return iOS ? "ios" : "none";
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** How the band can be installed on this device ("none" on the server and on desktop browsers). */
export function useInstallKind(): InstallKind {
  return useSyncExternalStore(subscribe, installKind, () => "none");
}

export async function promptInstall(): Promise<void> {
  const p = deferredPrompt;
  if (!p) return;
  deferredPrompt = null;
  emit();
  await p.prompt().catch(() => {});
}

const noopSubscribe = () => () => {};
/** Resident id remembered on this phone (fallback when /band is opened without ?resident=). */
export function useStoredResidentId(): string | null {
  return useSyncExternalStore(
    noopSubscribe,
    () => {
      try {
        return localStorage.getItem(STORED_RESIDENT_KEY);
      } catch {
        return null;
      }
    },
    () => null,
  );
}

/**
 * Real band (not the dashboard's embedded frame): point the manifest at this resident so the home-screen
 * app opens straight into their band, remember the resident on this phone, and register the service worker.
 */
export function useBandPwa(residentId: string, enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    try {
      localStorage.setItem(STORED_RESIDENT_KEY, residentId);
    } catch {
      // Private mode: the manifest's start_url still carries the resident.
    }
    const link = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
    if (link) link.href = `${MANIFEST_PATH}?resident=${encodeURIComponent(residentId)}`;
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js", { scope: "/band", updateViaCache: "none" }).catch(() => {});
    }
  }, [residentId, enabled]);
}
