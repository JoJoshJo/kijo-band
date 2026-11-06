import { Suspense } from "react";
import { findLogo } from "@/components/dashboard/findLogo";
import NurseView from "@/components/dashboard/NurseView";
import "../../dashboard/dashboard.css";

// Nurse ids live in the DB, so the param is runtime data → read it inside <Suspense> (Cache Components rule).
async function NurseRoute({ params, logoSrc }: { params: Promise<{ id: string }>; logoSrc: string | null }) {
  const { id } = await params;
  return <NurseView nurseId={id} logoSrc={logoSrc} />;
}

export default function NursePage({ params }: PageProps<"/nurse/[id]">) {
  return (
    <Suspense fallback={<div className="h-screen bg-[#070b14]" />}>
      <NurseRoute params={params} logoSrc={findLogo()} />
    </Suspense>
  );
}
