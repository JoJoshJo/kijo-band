import { Suspense } from "react";
import BandApp from "./BandApp";

// /band?resident=<id>[&embedded=1] — resident app (stand-in for the Kijo bracelet).
export default function BandPage() {
  return (
    <Suspense fallback={<div className="flex flex-1 items-center justify-center text-2xl text-muted">…</div>}>
      <BandApp />
    </Suspense>
  );
}
