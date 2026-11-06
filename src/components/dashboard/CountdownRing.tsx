"use client";

import { Check } from "@phosphor-icons/react";
import { formatDuration } from "./util";

/** Visual countdown to escalation. `remainingMs` null → acknowledged (full neutral ring with a check). */
export default function CountdownRing({
  remainingMs,
  totalMs,
  color,
}: {
  remainingMs: number | null;
  totalMs: number;
  color: string;
}) {
  const r = 16;
  const c = 2 * Math.PI * r;
  const frac = remainingMs == null ? 1 : Math.max(0, Math.min(1, remainingMs / totalMs));
  const stroke = remainingMs == null ? "#8a97a6" : color;
  return (
    <div className="relative h-12 w-12 shrink-0" title="Time until escalation to charge nurse">
      <svg viewBox="0 0 40 40" className="h-12 w-12 -rotate-90" aria-hidden>
        <circle cx="20" cy="20" r={r} fill="none" stroke="#243041" strokeWidth="3.5" />
        <circle
          cx="20"
          cy="20"
          r={r}
          fill="none"
          stroke={stroke}
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - frac)}
          style={{ transition: "stroke-dashoffset 0.5s linear" }}
        />
      </svg>
      <span className="num absolute inset-0 flex items-center justify-center text-xs text-ink">
        {remainingMs == null ? <Check size={16} weight="bold" aria-label="Acknowledged" /> : formatDuration(remainingMs)}
      </span>
    </div>
  );
}
