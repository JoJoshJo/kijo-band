import type { SWRConfiguration } from "swr";

// /api/state polling. Nurse view and Charge view poll fast; other pages poll every second.
// dedupingInterval 0: SWR's default 2 s dedupe window would silently stretch a 1 s / 500 ms poll to ~2 s
// (in-flight requests are still shared). Polling pauses while the tab is hidden and resumes on focus.
export const FAST_POLL_MS = 500;
export const POLL_MS = 1000;

export function statePolling(ms: number): SWRConfiguration {
  return { refreshInterval: ms, dedupingInterval: 0, refreshWhenHidden: false, refreshWhenOffline: false };
}
