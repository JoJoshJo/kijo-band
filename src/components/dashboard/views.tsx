"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useSessionValue } from "./useSessionValue";

/** nurse = /nurse/[id] (per nurse) · patient = /patient · charge = /dashboard (Grace's whole-floor view). */
export type View = "nurse" | "patient" | "charge";

export const NURSE_KEY = "kijo-nurse"; // sessionStorage: who's on shift in this tab

export function nurseHref(nurseId: string): string {
  return nurseId ? `/nurse/${encodeURIComponent(nurseId)}` : "/nurse";
}

/** Remembered nurse for this tab ("" if none yet) and a setter. */
export function useCurrentNurse(): [string, (id: string) => void] {
  return useSessionValue(NURSE_KEY);
}

export function isTypingTarget(target: EventTarget | null): boolean {
  const t = target as HTMLElement | null;
  return !!t && (t.isContentEditable || ["INPUT", "SELECT", "TEXTAREA"].includes(t.tagName));
}

/** Header segmented control: Nurse view | Patient view | Charge view. Neutral: teal is for primary buttons only. */
export function ViewToggle({ current }: { current: View }) {
  const [nurseId] = useCurrentNurse();
  const items: [View, string, string][] = [
    ["nurse", nurseHref(nurseId), "Nurse"],
    ["patient", "/patient", "Patient"],
    ["charge", "/dashboard", "Charge"],
  ];
  return (
    <nav
      aria-label="Switch view"
      title="Press V to switch Nurse ⇄ Patient"
      className="flex h-9 items-center rounded-btn border border-line-2 bg-surface p-0.5"
    >
      {items.map(([view, href, label]) => {
        const active = view === current;
        return (
          <Link
            key={view}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`flex h-full items-center rounded-[8px] px-3 text-sm font-medium transition-colors ${
              active ? "bg-surface-2 text-ink shadow-[inset_0_0_0_1px_var(--kj-line-2)]" : "text-muted hover:text-ink"
            }`}
          >
            {label}
            <span className="sr-only"> view</span>
          </Link>
        );
      })}
    </nav>
  );
}

/** V switches Nurse ⇄ Patient view (from Charge view it goes to Patient). Ignored while typing. */
export function useViewShortcut(current: View) {
  const router = useRouter();
  const [nurseId] = useCurrentNurse();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "v" && e.key !== "V") return;
      if (e.metaKey || e.ctrlKey || e.altKey || isTypingTarget(e.target)) return;
      router.push(current === "patient" ? nurseHref(nurseId) : "/patient");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [current, router, nurseId]);
}
