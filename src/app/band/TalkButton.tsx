"use client";

import dynamic from "next/dynamic";
import { useMemo } from "react";
import useSWR from "swr";
import { recolorLottie } from "./_lib/lottieColor";
import { FOCUS, useReducedMotion } from "./_lib/a11y";

// lottie-web touches `document` when it loads, so it only ever runs in the browser.
const Lottie = dynamic(() => import("lottie-react").then((m) => m.Lottie), { ssr: false });

export const TALK_ANIMATION_PATH = "/animations/talk.json";
const COLORS = { red: "#dc2626", green: "#16a34a" } as const;
export type TalkColor = keyof typeof COLORS;

const fetchJson = async (url: string): Promise<object> => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
};

/**
 * The band's one big button: tap and talk. Lottie animation recoloured at runtime (red normally, green
 * while help is coming); calm and slow when idle, fast while listening. Until the animation file exists
 * (or if it fails to load) a plain coloured circle with a microphone stands in.
 * prefers-reduced-motion: the animation stays still (first frame) and the fallback doesn't pulse.
 */
export default function TalkButton({
  color,
  active,
  label,
  hint,
  disabled,
  onClick,
}: {
  color: TalkColor;
  active: boolean;
  label: string;
  /** Second line under the label, e.g. "or say “Kijo”" */
  hint?: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  const { data: animation, error } = useSWR(TALK_ANIMATION_PATH, fetchJson, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    shouldRetryOnError: false,
  });
  const reduced = useReducedMotion();
  const recolored = useMemo(() => (animation ? recolorLottie(animation, COLORS[color]) : null), [animation, color]);
  const bg = color === "green" ? "bg-green-600" : "bg-red-600";
  const glow = color === "green" ? "shadow-[0_0_70px_rgba(22,163,74,0.5)]" : "shadow-[0_0_70px_rgba(220,38,38,0.5)]";

  return (
    <div className="flex flex-col items-center gap-3">
      <button
        onClick={onClick}
        disabled={disabled}
        aria-label={label}
        aria-pressed={active}
        className={`relative aspect-square w-[66vw] max-w-72 rounded-full active:scale-95 disabled:opacity-60 ${FOCUS}`}
      >
        {recolored && !error ? (
          <Lottie
            key={`${color}-${reduced}`}
            src={recolored}
            autoplay={!reduced}
            loop
            speed={active ? 1.6 : 0.6}
            className="absolute inset-0"
            aria-hidden
          />
        ) : (
          <span className={`absolute inset-0 flex items-center justify-center rounded-full ${bg} ${glow}`}>
            {active && <span className={`absolute inset-0 rounded-full ${bg} opacity-40 motion-safe:animate-ping`} aria-hidden />}
            <span className={`absolute inset-0 rounded-full ${bg} ${active ? "" : "motion-safe:animate-pulse"}`} aria-hidden />
            <MicIcon />
          </span>
        )}
      </button>
      <div className="flex flex-col items-center" aria-live="polite">
        <span className="text-3xl font-bold">{label}</span>
        {hint && <span className="text-xl text-slate-300">{hint}</span>}
      </div>
    </div>
  );
}

function MicIcon() {
  return (
    <svg viewBox="0 0 24 24" className="relative h-1/3 w-1/3 text-white" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" />
    </svg>
  );
}
