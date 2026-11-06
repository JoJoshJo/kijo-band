"use client";

import { Moon, Sun } from "@phosphor-icons/react";
import { useSyncExternalStore } from "react";
import { THEME_KEY, applyTheme, type Theme } from "./theme";

function subscribe(onChange: () => void) {
  const obs = new MutationObserver(onChange);
  obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => obs.disconnect();
}
const current = (): Theme => (document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark");

/** Sun/Moon button. The label names the mode you switch TO. */
export default function ThemeToggle({ showLabel = true }: { showLabel?: boolean }) {
  const theme = useSyncExternalStore(subscribe, current, () => "dark" as Theme);
  const next: Theme = theme === "dark" ? "light" : "dark";
  const label = next === "light" ? "Light mode" : "Dark mode";
  return (
    <button
      type="button"
      onClick={() => {
        try {
          localStorage.setItem(THEME_KEY, next);
        } catch {
          // private mode: still switch for this page
        }
        applyTheme(next);
      }}
      title={label}
      aria-label={label}
      className="inline-flex h-9 items-center gap-2 rounded-btn border border-line-2 px-3 text-sm font-medium text-ink transition-colors hover:bg-surface-2"
    >
      {next === "light" ? <Sun size={18} aria-hidden /> : <Moon size={18} aria-hidden />}
      {showLabel && <span className="hidden xl:inline">{label}</span>}
    </button>
  );
}
