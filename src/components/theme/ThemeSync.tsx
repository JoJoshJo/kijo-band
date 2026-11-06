"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { applyTheme, isThemed, storedTheme } from "./theme";

/** Client-side navigation keeps <html>: re-apply on every route (dashboard pages themed, band/join dark). */
export default function ThemeSync() {
  const pathname = usePathname();
  useEffect(() => {
    applyTheme(isThemed(pathname) ? storedTheme() : "dark");
  }, [pathname]);
  return null;
}
