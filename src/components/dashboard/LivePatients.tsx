"use client";

import { QrCode } from "@phosphor-icons/react";
import { useState } from "react";
import type { Alert, Resident } from "@/lib/types";
import QrModal from "./QrModal";
import ResidentTile from "./ResidentTile";
import { topAlertFor } from "./util";

/** Most recent sign of life: joined, moved, or raised an alert. */
function lastActivity(r: Resident, alerts: Alert[]): number {
  let t = Math.max(r.createdAt ?? 0, r.lastMotionAt ?? 0);
  for (const a of alerts)
    if (a.residentId === r.id && a.createdAt > t) t = a.createdAt;
  return t;
}

/**
 * Main nurse view: joined QR guests ("Live residents") on top as the largest tiles, most recent activity
 * first; her demo residents (3 — one French, one non-verbal, one high fall-risk) shown below.
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
  const guests = residents
    .filter((r) => r.isGuest)
    .sort((a, b) => lastActivity(b, alerts) - lastActivity(a, alerts));
  const demo = residents.filter((r) => !r.isGuest);

  return (
    <div className="flex flex-col gap-4">
      <section aria-labelledby="live-residents">
        <h2 id="live-residents" className="mb-2 flex items-center gap-2">
          <span className="label-caps">Live residents</span>
          <span className="num rounded-full bg-surface-2 px-2 text-xs text-ink">
            {guests.length}
          </span>
        </h2>
        {guests.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-card border border-dashed border-line-2 px-6 py-10 text-center">
            <QrCode size={40} className="text-muted" aria-hidden />
            <p className="text-base font-medium text-ink">
              No one has joined yet. Scan the QR code to join from a phone.
            </p>
            <button
              type="button"
              onClick={() => setQr(true)}
              className="inline-flex h-9 items-center gap-2 rounded-btn border border-line-2 px-3 text-sm font-medium text-ink transition-colors hover:bg-surface-2"
            >
              <QrCode size={18} aria-hidden />
              Show QR code
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
          <h2 id="demo-residents" className="mb-2 flex items-center gap-2">
            <span className="label-caps">Residents</span>
            <span className="num rounded-full bg-surface-2 px-2 text-xs text-ink">
              {demo.length}
            </span>
          </h2>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
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
        </section>
      )}

      {qr && <QrModal onClose={() => setQr(false)} />}
    </div>
  );
}
