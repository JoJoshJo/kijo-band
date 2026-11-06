"use client";

import { WifiSlash } from "@phosphor-icons/react";
import { formatDuration } from "./util";

/**
 * Shown while /api/state is failing (DB or network down). SWR keeps the last good data on screen,
 * so the banner says how old it is. Neutral colors: red/yellow are reserved for alarms.
 */
export default function ConnectionBanner({
  offline,
  lastOkAt,
  now,
}: {
  offline: boolean;
  lastOkAt: number | null; // client ms of the last successful update
  now: number | null; // client ms
}) {
  if (!offline) return null;
  const age = lastOkAt != null && now != null ? Math.max(0, now - lastOkAt) : null;
  return (
    <div role="alert" className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line-2 bg-surface-2 px-4 py-2 text-sm text-ink">
      <WifiSlash size={18} className="text-muted" aria-hidden />
      <span className="font-semibold">Connection lost. Reconnecting…</span>
      <span className="text-muted">
        {age != null ? (
          <>
            Showing the last known data (<span className="num">{formatDuration(age)}</span> old).
          </>
        ) : (
          "No data loaded yet."
        )}
      </span>
    </div>
  );
}
