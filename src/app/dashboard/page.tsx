import { readdirSync } from "node:fs";
import { join } from "node:path";
import Dashboard from "@/components/dashboard/Dashboard";
import "./dashboard.css";

// Use a logo from /public/brand/ if one exists (prefers names containing "logo"/"dark"), else text only.
function findLogo(): string | null {
  try {
    const files = readdirSync(join(process.cwd(), "public", "brand")).filter((f) => /\.(svg|png|webp)$/i.test(f));
    const pick =
      files.find((f) => /logo.*dark|dark.*logo/i.test(f)) ?? files.find((f) => /logo/i.test(f)) ?? files[0];
    return pick ? `/brand/${pick}` : null;
  } catch {
    return null;
  }
}

export default function DashboardPage() {
  return <Dashboard logoSrc={findLogo()} />;
}
