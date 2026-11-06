import { findLogo } from "@/components/dashboard/findLogo";
import PatientView from "./PatientView";
import "../dashboard/dashboard.css";

export default function PatientPage() {
  return <PatientView logoSrc={findLogo()} />;
}
