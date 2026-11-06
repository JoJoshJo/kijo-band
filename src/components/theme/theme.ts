// Dashboard light/dark theme. Dark is the default (no attribute); light = data-theme="light" on <html>.
// The band and /join are not themed yet (Session B owns them), so they always stay dark.

export type Theme = "dark" | "light";
export const THEME_KEY = "kijo-theme"; // localStorage

/** Paths that always render dark. */
export const UNTHEMED_PREFIXES = ["/band", "/join"] as const;

/**
 * Runs inline in <head> before first paint, so a stored light theme never flashes dark (and vice versa).
 * Kept tiny and dependency-free; it is a string, not a module.
 */
export const THEME_INIT_SCRIPT = `(function(){try{var p=location.pathname;if(${JSON.stringify(
  UNTHEMED_PREFIXES,
)}.some(function(x){return p===x||p.indexOf(x+"/")===0}))return;if(localStorage.getItem(${JSON.stringify(
  THEME_KEY,
)})==="light")document.documentElement.setAttribute("data-theme","light")}catch(e){}})();`;

export function isThemed(pathname: string): boolean {
  return !UNTHEMED_PREFIXES.some((x) => pathname === x || pathname.startsWith(x + "/"));
}

export function storedTheme(): Theme {
  try {
    return localStorage.getItem(THEME_KEY) === "light" ? "light" : "dark";
  } catch {
    return "dark";
  }
}

export function applyTheme(theme: Theme) {
  if (theme === "light") document.documentElement.setAttribute("data-theme", "light");
  else document.documentElement.removeAttribute("data-theme");
}
