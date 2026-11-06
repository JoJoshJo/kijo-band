import Dashboard from "@/components/dashboard/Dashboard";
import { findLogo } from "@/components/dashboard/findLogo";
import "./dashboard.css";

export default function DashboardPage() {
  return <Dashboard logoSrc={findLogo()} />;
}
