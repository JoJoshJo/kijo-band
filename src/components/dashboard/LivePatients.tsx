"use client";

import { CaretDown, QrCode } from "@phosphor-icons/react";
import { useState, useSyncExternalStore } from "react";
import type { Alert, Resident } from "@/lib/types";
import QrModal from "./QrModal";
import ResidentTile from "./ResidentTile";
import { topAlertFor } from "./util";

const OPEN_KEY = "kijo-demo-residents-open"; // localStorage: "1" = expanded

// Tiny localStorage-backed boolean (same tab updates via a custom event; SSR = collapsed).
const listeners = new Set<() => void>();
function subscribe(cb: () => void) {
  listeners.add(cb);
  window.addEventListener("storage", cb);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", cb);
  };
}
function readOpen(): boolean {
  try {
    return localStorage.getItem(OPEN_KEY) === "1";
  } catch {
    return false;
  }
}
function writeOpen(open: boolean) {
  try {
    localStorage.setItem(OPEN_KEY, open ? "1" : "0");
  } catch {}
  listeners.forEach((l) => l());
}

/** Most recent sign of life: joined, moved, or raised an alert. */
function lastActivity(r: Resident, alerts: Alert[]): number {
  let t = Math.max(r.createdAt ?? 0, r.lastMotionAt ?? 0);
  for (const a of alerts) if (a.residentId === r.id && a.createdAt > t) t = a.createdAt;
  return t;
}

/**
 * Main nurse view: joined QR guests ("Live patients") on top as the largest tiles, most recent activity
 * first; the seeded demo residents below in a section collapsed by default.
 */
export default function LivePatients({
  residents,
  alerts,
  heartRateOf,
  onSelect,
}: {
  residents: Resident[]; // this nurse's residents
  alerts: Alert[]; // this nurse's active alerts
  heartRateOf: (r: Resident) => number;
  onSelect: (id: string) => void;
}) {
  const [qr, setQr] = useState(false);
  const open = useSyncExternalStore(subscribe, readOpen, () => false);
  const guests = residents
    .filter((r) => r.isGuest)
    .sort((a, b) => lastActivity(b, alerts) - lastActivity(a, alerts));
  const demo = residents.filter((r) => !r.isGuest);
  const demoAlerts = alerts.filter((a) => demo.some((r) => r.id === a.residentId)).length;

  return (
    <div className="flex flex-col gap-4">
      <section aria-labelledby="live-patients">
        <h2 id="live-patients" className="mb-2 flex items-center gap-2">
          <span className="label-caps">Live patients</span>
          <span className="num rounded-full bg-surface-2 px-2 text-xs text-ink">{guests.length}</span>
        </h2>
        {guests.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-card border border-dashed border-line-2 px-6 py-10 text-center">
            <QrCode size={40} className="text-muted" aria-hidden />
            <p className="text-base font-medium text-ink">No patients joined yet — scan the QR</p>
            <button
              type="button"
              onClick={() => setQr(true)}
              className="inline-flex h-9 items-center gap-2 rounded-btn border border-line-2 px-3 text-sm font-medium text-ink transition-colors hover:bg-surface-2"
            >
              <QrCode size={18} aria-hidden />
              Show QR
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 2xl:grid-cols-3">
            {guests.map((r) => (
              <ResidentTile
                key={r.id}
                size="lg"
                resident={r}
                heartRate={heartRateOf(r)}
                alert={topAlertFor(alerts, r.id)}
                onSelect={onSelect}
              />
            ))}
          </div>
        )}
      </section>

      {demo.length > 0 && (
        <section aria-labelledby="demo-residents">
          <h2 id="demo-residents">
            <button
              type="button"
              aria-expanded={open}
              aria-controls="demo-residents-grid"
              onClick={() => writeOpen(!open)}
              className="flex w-full items-center gap-2 rounded-btn py-1 text-left"
            >
              <CaretDown
                size={16}
                weight="bold"
                className={`text-muted transition-transform ${open ? "" : "-rotate-90"}`}
                aria-hidden
              />
              <span className="label-caps">Demo residents ({demo.length})</span>
              {!open && demoAlerts > 0 && (
                <span className="rounded-full bg-surface-2 px-2 text-xs text-ink">
                  {demoAlerts} alert{demoAlerts === 1 ? "" : "s"} · in queue
                </span>
              )}
            </button>
          </h2>
          {open && (
            <div id="demo-residents-grid" className="mt-2 grid grid-cols-2 gap-2 xl:grid-cols-4">
              {demo.map((r) => (
                <ResidentTile
                  key={r.id}
                  resident={r}
                  heartRate={heartRateOf(r)}
                  alert={topAlertFor(alerts, r.id)}
                  onSelect={onSelect}
                />
              ))}
            </div>
          )}
        </section>
      )}

      {qr && <QrModal onClose={() => setQr(false)} />}
    </div>
  );
}
