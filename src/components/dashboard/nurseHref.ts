import { MAIN_NURSE_ID } from "@/lib/demoConfig";

/** Nurse view URL. No nurse chosen in this tab → the main nurse (demoConfig). Server-safe. */
export function nurseHref(nurseId: string): string {
  return `/nurse/${encodeURIComponent(nurseId || MAIN_NURSE_ID)}`;
}
