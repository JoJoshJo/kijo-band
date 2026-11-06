"use client";

import { useState } from "react";
import type { Resident } from "@/lib/types";

/** Right column: resident picker + phone-shaped frame running the real band app (embedded mode). */
export default function PresenterPanel({ residents }: { residents: Resident[] }) {
  const [picked, setPicked] = useState("");
  const residentId = residents.some((r) => r.id === picked) ? picked : (residents[0]?.id ?? "");
  const wings = ["North", "South", "Guest"] as const;

  return (
    <aside className="flex min-h-0 flex-col items-center gap-3 rounded-xl border border-slate-800 bg-slate-950/60 p-3">
      <div className="flex w-full items-center gap-2">
        <label htmlFor="presenter-resident" className="text-[11px] font-semibold tracking-widest text-slate-400">
          BAND
        </label>
        <select
          id="presenter-resident"
          value={residentId}
          onChange={(e) => setPicked(e.target.value)}
          className="min-w-0 flex-1 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-sm text-slate-200"
        >
          {wings.map((w) => {
            const list = residents.filter((r) => r.wing === w);
            return list.length === 0 ? null : (
              <optgroup key={w} label={`${w} wing`}>
                {list.map((r) => (
                  <option key={r.id} value={r.id}>
                    Room {r.room} · {r.name}
                  </option>
                ))}
              </optgroup>
            );
          })}
        </select>
      </div>

      {/* Phone frame */}
      <div className="relative flex min-h-0 w-full flex-1 items-start justify-center">
        <div className="relative aspect-[9/19.5] h-full max-h-[700px] rounded-[44px] border-[10px] border-slate-700 bg-black shadow-[0_0_40px_rgba(45,212,191,0.12)]">
          <div className="absolute left-1/2 top-1.5 z-10 h-5 w-24 -translate-x-1/2 rounded-full bg-black" />
          {residentId && (
            <iframe
              key={residentId}
              title="Kijo Band (embedded)"
              src={`/band?resident=${encodeURIComponent(residentId)}&embedded=1`}
              allow="microphone; accelerometer; gyroscope; screen-wake-lock"
              className="h-full w-full rounded-[34px] bg-black"
            />
          )}
        </div>
      </div>
      <p className="text-[10px] text-slate-500">Press P to hide</p>
    </aside>
  );
}
