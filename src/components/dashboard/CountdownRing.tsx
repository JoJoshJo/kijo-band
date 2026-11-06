"use client";

import { Check } from "@phosphor-icons/react";

import { formatDuration } from "./util";

/** Visual countdown to escalation. `remainingMs` null → acknowledged (ring shown full, teal). */
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
  const stroke = remainingMs == null ? "#2dd4bf" : color;
  return (
    <div className="relative h-11 w-11 shrink-0" title="Time until escalation to charge nurse">
      <svg viewBox="0 0 40 40" className="h-11 w-11 -rotate-90">
        <circle cx="20" cy="20" r={r} fill="none" stroke="#1e293b" strokeWidth="4" />
        <circle
          cx="20"
          cy="20"
          r={r}
          fill="none"
          stroke={stroke}
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - frac)}
          style={{ transition: "stroke-dashoffset 0.5s linear" }}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center font-mono text-[10px] text-slate-200">
        {remainingMs == null ? <Check size={14} weight="bold" aria-label="Acknowledged" /> : formatDuration(remainingMs)}
      </span>
    </div>
  );
}
