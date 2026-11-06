"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import useSWR from "swr";
import Header from "@/components/dashboard/Header";
import { initials } from "@/components/dashboard/util";
import { nurseHref, useCurrentNurse, useViewShortcut } from "@/components/dashboard/views";
import type { StateResponse } from "@/lib/types";

const fetcher = async (url: string): Promise<StateResponse> => {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
};

/** /nurse — "Who's on shift?" First visit picks a nurse (remembered per tab); later visits go straight there. */
export default function NursePicker({ logoSrc }: { logoSrc: string | null }) {
  useViewShortcut("nurse");
  const router = useRouter();
  const [remembered, setRemembered] = useCurrentNurse();
  const { data, error } = useSWR<StateResponse>("/api/state", fetcher, { refreshInterval: 3000 });

  // Already chose this session → go straight to that nurse's view.
  useEffect(() => {
    if (remembered) router.replace(nurseHref(remembered));
  }, [remembered, router]);

  const nurses = (data?.nurses ?? []).filter((n) => n.role !== "Charge");

  return (
    <div className="flex h-screen flex-col bg-bg text-ink">
      <Header logoSrc={logoSrc} view="nurse" live={error ? "offline" : data ? "live" : "connecting"} />
      <main className="flex flex-1 flex-col items-center justify-center gap-8 p-8">
        <h1 className="text-display font-semibold text-ink">Who&apos;s on shift?</h1>
        <div className="flex flex-wrap justify-center gap-5">
          {nurses.map((n) => {
            const count = data!.residents.filter((r) => r.assignedNurseId === n.id).length;
            return (
              <button
                key={n.id}
                type="button"
                onClick={() => {
                  setRemembered(n.id);
                  router.push(nurseHref(n.id));
                }}
                className="flex w-64 flex-col items-center gap-3 rounded-card border border-line bg-surface p-8 transition-colors hover:border-line-2 hover:bg-surface-2"
              >
                <span className="flex h-20 w-20 items-center justify-center rounded-full border border-line-2 bg-surface-2 text-2xl font-semibold text-ink">
                  {initials(n.name)}
                </span>
                <span className="text-xl font-semibold text-ink">{n.name}</span>
                <span className="text-sm text-muted">
                  {n.role} · {n.wing} · {count} residents
                </span>
              </button>
            );
          })}
        </div>
        {!data && !error && <p className="text-sm text-muted">Loading…</p>}
      </main>
    </div>
  );
}
