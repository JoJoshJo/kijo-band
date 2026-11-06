import { redirect } from "next/navigation";
import { nurseHref } from "@/components/dashboard/nurseHref";
import { MAIN_NURSE_ID } from "@/lib/demoConfig";

// /nurse → the main nurse's view directly (no picker in the main flow; see /nurse/switch).
export default function NursePage() {
  redirect(nurseHref(MAIN_NURSE_ID));
}
