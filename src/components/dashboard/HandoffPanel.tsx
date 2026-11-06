"use client";

import { useState } from "react";
import type { Handoff } from "@/app/api/report/handoff/facts";
import { formatDuration } from "./util";

function formatAvg(ms: number | null): string {
  if (ms == null) return "—";
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
  return formatDuration(ms);
}

/** ["G2","G4","G2"] → "Rm G2 ×2, Rm G4" */
function roomCounts(rooms: string[]): string {
  const counts = new Map<string, number>();
  for (const r of rooms) counts.set(r, (counts.get(r) ?? 0) + 1);
  return [...counts].map(([r, n]) => `Rm ${r}${n > 1 ? ` ×${n}` : ""}`).join(", ");
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="mb-2 text-[11px] font-semibold tracking-widest text-slate-500">{children}</h3>;
}

/** "Generate shift handoff" → POST /api/report/handoff. Neutral slate: red/yellow stay reserved for alarms. */
export default function HandoffPanel() {
  const [state, setState] = useState<
    { kind: "idle" } | { kind: "loading" } | { kind: "error"; message: string } | { kind: "done"; handoff: Handoff }
  >({ kind: "idle" });
  const [copied, setCopied] = useState(false);

  async function generate() {
    setState({ kind: "loading" });
    setCopied(false);
    try {
      const res = await fetch("/api/report/handoff", { method: "POST", cache: "no-store" });
      if (res.status === 429) {
        const sec = res.headers.get("Retry-After");
        setState({ kind: "error", message: `Too many requests — try again in ${sec ?? "a few"} s.` });
        return;
      }
      if (!res.ok) throw new Error(String(res.status));
      setState({ kind: "done", handoff: (await res.json()) as Handoff });
    } catch {
      setState({ kind: "error", message: "Could not build the handoff. Try again." });
    }
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  const loading = state.kind === "loading";

  return (
    <section aria-label="Shift handoff" className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="mr-auto">
          <h2 className="text-sm font-semibold text-white">Shift handoff</h2>
          <p className="text-xs text-slate-400">A morning briefing drafted from tonight&apos;s alerts.</p>
        </div>
        {state.kind === "done" && (
          <button
            type="button"
            onClick={() => copy(state.handoff.text)}
            className="min-h-10 rounded-lg border border-slate-600 px-3 text-sm text-slate-200 hover:bg-slate-800"
          >
            {copied ? "✓ Copied" : "Copy"}
          </button>
        )}
        <button
          type="button"
          onClick={generate}
          disabled={loading}
          className="min-h-10 rounded-lg bg-white px-4 text-sm font-semibold text-slate-900 hover:bg-slate-200 disabled:opacity-60"
        >
          {loading ? "Writing…" : state.kind === "done" ? "Regenerate" : "Generate shift handoff"}
        </button>
      </div>

      <div aria-live="polite" className="mt-3 empty:mt-0">
        {loading && <p className="text-sm text-slate-400">Reading tonight&apos;s alerts and drafting the handoff…</p>}
        {state.kind === "error" && <p className="text-sm text-orange-300">{state.message}</p>}
      </div>

      {state.kind === "done" && <HandoffBody handoff={state.handoff} />}
    </section>
  );
}

function HandoffBody({ handoff: h }: { handoff: Handoff }) {
  return (
    <div className="mt-1 flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
        <span className="rounded-full border border-slate-600 bg-slate-800 px-2 py-0.5 font-medium text-slate-200">
          {h.source === "claude" ? "✦ Drafted by Claude" : "Rule-based (AI unavailable)"}
        </span>
        <span>
          {h.totals.alerts} alerts · {h.totals.escalations} escalated · {h.totals.open} not resolved ·{" "}
          {new Date(h.generatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </span>
      </div>

      <div>
        <SectionTitle>NEEDS ATTENTION THIS MORNING</SectionTitle>
        {h.needsAttention.length === 0 ? (
          <p className="text-sm text-slate-300">Nobody flagged — quiet night.</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {h.needsAttention.map((a) => (
              <li key={a.room} className="flex gap-3 rounded-lg bg-slate-900 px-3 py-2 text-sm">
                <span className="shrink-0 font-mono font-semibold text-white">Rm {a.room}</span>
                <span className="text-slate-300">
                  <span className="font-medium text-slate-100">{a.name}</span> — {a.reason}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <SectionTitle>BY NURSE</SectionTitle>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-slate-500">
              <tr>
                <th scope="col" className="py-1 pr-3 font-medium">Nurse</th>
                <th scope="col" className="py-1 pr-3 font-medium">Handled</th>
                <th scope="col" className="py-1 pr-3 font-medium">Avg response</th>
                <th scope="col" className="py-1 font-medium">Left open</th>
              </tr>
            </thead>
            <tbody>
              {h.nurses.map((n) => (
                <tr key={n.nurseId} className="border-t border-slate-800 align-top">
                  <th scope="row" className="py-1.5 pr-3 font-medium text-slate-100">
                    {n.name} <span className="text-xs font-normal text-slate-500">{n.role}</span>
                    {n.note && <div className="text-xs font-normal text-slate-400">{n.note}</div>}
                  </th>
                  <td className="py-1.5 pr-3 font-mono text-slate-200">
                    {n.handled}/{n.alerts}
                  </td>
                  <td className="py-1.5 pr-3 font-mono text-slate-200">{formatAvg(n.avgResponseMs)}</td>
                  <td className="py-1.5 text-slate-300">
                    {n.open.length ? roomCounts(n.open.map((o) => o.room)) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <SectionTitle>RECOMMENDATIONS</SectionTitle>
        <ol className="flex list-decimal flex-col gap-1 pl-5 text-sm text-slate-200 marker:text-slate-500">
          {h.recommendations.map((r, i) => (
            <li key={i}>{r}</li>
          ))}
        </ol>
      </div>

      <p className="text-[11px] text-slate-500">
        {h.source === "claude"
          ? "AI draft — numbers come from the alert log; verify before acting. Fictional demo data."
          : "Built from simple rules over the alert log. Fictional demo data."}
      </p>
    </div>
  );
}
