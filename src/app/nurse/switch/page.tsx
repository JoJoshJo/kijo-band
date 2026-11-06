import { findLogo } from "@/components/dashboard/findLogo";
import NursePicker from "./NursePicker";
import "../../dashboard/dashboard.css";

// /nurse/switch — nurse picker, reachable only from the small "Switch nurse" link (testing).
export default function NursePickerPage() {
  return <NursePicker logoSrc={findLogo()} />;
}
