"use client";

import { useEffect, useState } from "react";
import { ViewToggle, type View } from "./views";

// Demo night clock: starts at 03:12 AM when the dashboard opens and advances in real time.
const NIGHT_START_SECONDS = 3 * 3600 + 12 * 60;

function formatClock(totalSeconds: number) {
  const s = Math.floor(totalSeconds) % 86400;
  const h24 = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${String(h12).padStart(2, "0")}:${String(m).padStart(2, "0")} ${h24 < 12 ? "AM" : "PM"}`;
}

function NightClock() {
  const [t, setT] = useState<{ start: number; now: number } | null>(null);
  useEffect(() => {
    const tick = () =>
      setT((prev) => {
        const now = Date.now();
        return { start: prev?.start ?? now, now };
      });
    const first = setTimeout(tick, 0);
    const iv = setInterval(tick, 1000);
    return () => {
      clearTimeout(first);
      clearInterval(iv);
    };
  }, []);
  if (!t) return <span className="font-mono text-slate-500">--:-- --</span>;
  return <span className="font-mono text-white">{formatClock(NIGHT_START_SECONDS + (t.now - t.start) / 1000)}</span>;
}

export default function Header({
  logoSrc,
  view,
  nursesOn,
  openCount,
  live,
  actions,
}: {
  logoSrc: string | null;
  view: View;
  nursesOn: number;
  openCount: number;
  live: "live" | "offline" | "connecting";
  actions?: React.ReactNode;
}) {
  return (
    <header className="flex items-center gap-5 border-b border-slate-800 px-5 py-3">
      <span className="flex items-center gap-2.5">
        {logoSrc ? (
          // Source is black-on-white with wide padding: invert → white hexagon on black, then `screen` drops
          // the black so the glyph shows the header background. Scale 1.4 crops the padding (hexagon ≈ 71% tall).
          <span className="relative block h-10 w-10 overflow-hidden" aria-hidden>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={logoSrc}
              alt=""
              width={40}
              height={40}
              className="h-full w-full scale-[1.4] mix-blend-screen invert"
              decoding="async"
            />
          </span>
        ) : null}
        <span className="text-xl font-black tracking-[0.3em] text-white">KIJO</span>
      </span>
      <ViewToggle current={view} />
      <span className="text-slate-400">Night Shift</span>
      <NightClock />
      <span className="text-sm text-slate-400">
        Nurses on: <span className="text-white">{nursesOn}</span>
      </span>
      <span className="text-sm text-slate-400">
        Open alerts: <span className="font-mono text-white">{openCount}</span>
      </span>
      <div className="ml-auto flex items-center gap-2">{actions}</div>
      <span
        className={`text-sm ${
          live === "live" ? "text-emerald-400" : live === "offline" ? "text-orange-400" : "text-slate-400"
        }`}
      >
        ● {live === "live" ? "Live" : live === "offline" ? "Offline" : "Connecting…"}
      </span>
    </header>
  );
}
