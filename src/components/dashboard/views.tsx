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

/** Header segmented control: Nurse view | Patient view, plus a small Charge view link. */
export function ViewToggle({ current }: { current: View }) {
  const [nurseId] = useCurrentNurse();
  const item = (view: "nurse" | "patient", href: string, label: string) => {
    const active = view === current;
    return (
      <Link
        href={href}
        aria-current={active ? "page" : undefined}
        className={`px-3 py-1 text-sm font-semibold transition ${
          active ? "bg-teal-500 text-slate-950" : "text-slate-300 hover:bg-slate-800"
        }`}
      >
        {label}
      </Link>
    );
  };
  return (
    <span className="flex items-center gap-3">
      <nav aria-label="Switch view" className="flex overflow-hidden rounded-md border border-teal-600" title="Press V to switch">
        {item("nurse", nurseHref(nurseId), "Nurse view")}
        {item("patient", "/patient", "Patient view")}
      </nav>
      <Link
        href="/dashboard"
        aria-current={current === "charge" ? "page" : undefined}
        className={`text-xs underline-offset-4 hover:underline ${
          current === "charge" ? "font-semibold text-teal-300" : "text-slate-400"
        }`}
      >
        Charge view
      </Link>
    </span>
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
