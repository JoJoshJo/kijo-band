"use client";

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
    <div
      role="alert"
      className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-100 sm:px-5"
    >
      <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-orange-400" aria-hidden />
      <span className="font-semibold">Connection lost — retrying…</span>
      <span className="text-slate-400">
        {age != null ? `Showing the last known data (${formatDuration(age)} old).` : "No data loaded yet."}
      </span>
    </div>
  );
}
