"use client";

import { Moon } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import ThemeToggle from "@/components/theme/ThemeToggle";
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
  return (
    <span className="inline-flex items-center gap-2 text-sm" title="Night shift clock (demo)">
      <Moon size={16} className="text-muted" aria-hidden />
      <span className="hidden text-muted md:inline">Night shift</span>
      <span className="num text-ink">{t ? formatClock(NIGHT_START_SECONDS + (t.now - t.start) / 1000) : "--:-- --"}</span>
    </span>
  );
}

export function Logo({ src, size = 32 }: { src: string | null; size?: number }) {
  if (!src) return null;
  // Source is black-on-white with wide padding: invert → white hexagon on black, then `screen` drops
  // the black so the glyph shows the background. Scale 1.4 crops the padding (hexagon ≈ 71% tall).
  return (
    <span className="relative block shrink-0 overflow-hidden" style={{ width: size, height: size }} aria-hidden>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" width={size} height={size} className="h-full w-full scale-[1.4] kj-logo" decoding="async" />
    </span>
  );
}

function LivePill({ live }: { live: "live" | "offline" | "connecting" }) {
  const dot = live === "live" ? "bg-ok" : live === "offline" ? "bg-muted" : "bg-muted animate-pulse";
  return (
    <span
      role="status"
      className="inline-flex h-7 items-center gap-2 rounded-full border border-line-2 bg-surface px-3 text-xs font-medium text-ink"
    >
      <span className={`h-2 w-2 rounded-full ${dot}`} aria-hidden />
      {live === "live" ? "Live" : live === "offline" ? "Offline" : "Connecting…"}
    </span>
  );
}

/** Icon button with a visible label on wide screens, tooltip + aria-label always. */
export function HeaderButton({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className="inline-flex h-9 items-center gap-2 rounded-btn border border-line-2 px-3 text-sm font-medium text-ink transition-colors hover:bg-surface-2"
    >
      {icon}
      <span className="hidden xl:inline">{label}</span>
    </button>
  );
}

export default function Header({
  logoSrc,
  view,
  info,
  live,
  actions,
}: {
  logoSrc: string | null;
  view: View;
  info?: React.ReactNode; // view-specific context after the clock
  live: "live" | "offline" | "connecting";
  actions?: React.ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line bg-bg px-4 py-3">
      {/* Phone: logo + actions on row 1, view toggle / clock / context wrap below. lg: one row. */}
      <span className="order-1 flex items-center gap-2">
        <Logo src={logoSrc} />
        <span className="text-base font-semibold tracking-[0.3em] text-ink">KIJO</span>
      </span>
      <span className="order-3 lg:order-2">
        <ViewToggle current={view} />
      </span>
      <span className="order-4 lg:order-3">
        <NightClock />
      </span>
      {info && <span className="order-5 lg:order-4">{info}</span>}
      <div className="order-2 ml-auto flex flex-wrap items-center justify-end gap-2 lg:order-5">
        {actions}
        <ThemeToggle />
        <LivePill live={live} />
      </div>
    </header>
  );
}
