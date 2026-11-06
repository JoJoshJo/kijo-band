"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export type View = "nurse" | "patient";
export const VIEW_HREF: Record<View, string> = { nurse: "/dashboard", patient: "/patient" };

export function isTypingTarget(target: EventTarget | null): boolean {
  const t = target as HTMLElement | null;
  return !!t && (t.isContentEditable || ["INPUT", "SELECT", "TEXTAREA"].includes(t.tagName));
}

/** Header segmented control: Nurse view | Patient view. */
export function ViewToggle({ current }: { current: View }) {
  const item = (view: View, label: string) => {
    const active = view === current;
    return (
      <Link
        href={VIEW_HREF[view]}
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
    <nav aria-label="Switch view" className="flex overflow-hidden rounded-md border border-teal-600" title="Press V to switch">
      {item("nurse", "Nurse view")}
      {item("patient", "Patient view")}
    </nav>
  );
}

/** V switches between Nurse and Patient view (ignored while typing in a field). */
export function useViewShortcut(current: View) {
  const router = useRouter();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "v" && e.key !== "V") return;
      if (e.metaKey || e.ctrlKey || e.altKey || isTypingTarget(e.target)) return;
      router.push(VIEW_HREF[current === "nurse" ? "patient" : "nurse"]);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [current, router]);
}
