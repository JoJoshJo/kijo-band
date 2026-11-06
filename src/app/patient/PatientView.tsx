"use client";

import { ArrowRight, X } from "@phosphor-icons/react";

import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import useSWR from "swr";
import Header from "@/components/dashboard/Header";
import { useEscalation } from "@/components/dashboard/useEscalation";
import { useSessionValue } from "@/components/dashboard/useSessionValue";
import { ALERT_LABEL, PRIORITY, residentTitle, useNow } from "@/components/dashboard/util";
import { nurseHref, useViewShortcut } from "@/components/dashboard/views";
import type { Alert, StateResponse } from "@/lib/types";

const fetcher = async (url: string): Promise<StateResponse> => {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
};

const RESIDENT_KEY = "kijo-patient-resident";
const TOAST_MS = 8000;
const WINGS = ["North", "South", "Guest"] as const;

/** Patient view: hosts the real band app (embedded mode) at phone width, full height. */
export default function PatientView({ logoSrc }: { logoSrc: string | null }) {
  useViewShortcut("patient");
  const [picked, setPicked] = useSessionValue(RESIDENT_KEY);
  const [toast, setToast] = useState<Alert | null>(null);

  // Detect alerts created for the shown resident after this page loaded → toast.
  const seen = useRef<Set<string> | null>(null);
  const shownId = useRef("");
  const [skew, setSkew] = useState(0);
  const { data, error, mutate } = useSWR<StateResponse>("/api/state", fetcher, {
    refreshInterval: 1000,
    onSuccess: (d) => {
      setSkew(d.serverTime - Date.now());
      if (!seen.current) {
        seen.current = new Set(d.alerts.map((a) => a.id));
        return;
      }
      const fresh = d.alerts.filter((a) => !seen.current!.has(a.id));
      fresh.forEach((a) => seen.current!.add(a.id));
      const mine = fresh.filter((a) => a.residentId === shownId.current);
      if (mine.length > 0) setToast(mine.sort((a, b) => a.priority - b.priority)[0]);
    },
  });

  const residents = data?.residents ?? [];
  const alerts = data?.alerts ?? [];
  const residentId = residents.some((r) => r.id === picked) ? picked : (residents[0]?.id ?? "");
  const resident = residents.find((r) => r.id === residentId);

  useEffect(() => {
    shownId.current = residentId;
  }, [residentId]);

  // Escalation keeps running while the presenter is on this view.
  const clientNow = useNow(1000);
  const refresh = useCallback(() => void mutate(), [mutate]);
  useEscalation(alerts, clientNow == null ? null : clientNow + skew, refresh);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), TOAST_MS);
    return () => clearTimeout(t);
  }, [toast]);

  return (
    <div className="flex h-screen flex-col bg-bg text-ink">
      <Header
        logoSrc={logoSrc}
        view="patient"
        info={
          <span className="text-sm text-muted">
            Open alerts <span className="num text-ink">{alerts.filter((a) => a.status === "open").length}</span>
          </span>
        }
        live={error ? "offline" : data ? "live" : "connecting"}
      />

      <div className="flex items-center justify-center gap-3 border-b border-line px-5 py-2">
        <label htmlFor="patient-resident" className="label-caps">
          Resident
        </label>
        <select
          id="patient-resident"
          value={residentId}
          onChange={(e) => setPicked(e.target.value)}
          className="h-9 w-full max-w-80 rounded-btn border border-line-2 bg-surface-2 px-2 text-sm text-ink"
        >
          {WINGS.map((w) => {
            const list = residents.filter((r) => r.wing === w);
            return list.length === 0 ? null : (
              <optgroup key={w} label={`${w} wing`}>
                {list.map((r) => (
                  <option key={r.id} value={r.id}>
                    {residentTitle(r)}
                    {r.canSpeak ? "" : " (non-verbal)"}
                  </option>
                ))}
              </optgroup>
            );
          })}
        </select>
        {resident && <span className="text-xs text-muted">{resident.language.toUpperCase()}</span>}
      </div>

      <main className="flex min-h-0 flex-1 justify-center bg-bg">
        {residentId && <BandFrame residentId={residentId} title={`Kijo Band: ${resident?.name ?? residentId}`} />}
      </main>

      {toast && (
        <div
          role="status"
          className="kijo-toast fixed right-6 top-28 z-50 flex items-center gap-4 rounded-card border border-line-2 bg-surface px-4 py-3 shadow-2xl"
        >
          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${PRIORITY[toast.priority].chip}`}>
            {PRIORITY[toast.priority].label}
          </span>
          <span className="text-sm text-ink">
            Alert sent · {ALERT_LABEL[toast.type]}
          </span>
          <Link
            href={nurseHref(toast.assignedNurseId)}
            className="inline-flex h-9 items-center gap-1.5 rounded-btn bg-brand px-3 text-sm font-semibold text-on-brand hover:bg-brand-hover"
          >
            Open nurse view <ArrowRight size={16} weight="bold" aria-hidden />
          </Link>
          <button
            type="button"
            onClick={() => setToast(null)}
            aria-label="Close message"
            className="flex h-9 w-9 items-center justify-center rounded-btn text-muted hover:bg-surface-2 hover:text-ink"
          >
            <X size={18} aria-hidden />
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * The band iframe. Next.js keeps visited routes mounted but hidden (React Activity), so the src is set in a
 * layout effect and cleared in its cleanup: the band (mic, motion, HR writes) only runs while this view is visible.
 */
function BandFrame({ residentId, title }: { residentId: string; title: string }) {
  const ref = useRef<HTMLIFrameElement>(null);
  useLayoutEffect(() => {
    const frame = ref.current;
    if (!frame) return;
    frame.src = `/band?resident=${encodeURIComponent(residentId)}&embedded=1`;
    return () => {
      frame.src = "about:blank";
    };
  }, [residentId]);
  return (
    <iframe
      ref={ref}
      title={title}
      allow="microphone; accelerometer; gyroscope; screen-wake-lock"
      className="h-full w-[430px] border-x border-line bg-black"
    />
  );
}
