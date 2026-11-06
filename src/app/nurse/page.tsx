import { findLogo } from "@/components/dashboard/findLogo";
import NursePicker from "./NursePicker";
import "../dashboard/dashboard.css";

export default function NursePickerPage() {
  return <NursePicker logoSrc={findLogo()} />;
}
