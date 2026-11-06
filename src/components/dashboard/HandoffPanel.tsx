"use client";

import { Check, Copy, Sparkle } from "@phosphor-icons/react";

import { useState } from "react";
import type { Handoff } from "@/app/api/report/handoff/facts";
import { formatDuration } from "./util";

function formatAvg(ms: number | null): string {
  if (ms == null) return "—";
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
  return formatDuration(ms);
}

/** ["G2","G4","G2"] → "Room G2 ×2, Room G4" */
function roomCounts(rooms: string[]): string {
  const counts = new Map<string, number>();
  for (const r of rooms) counts.set(r, (counts.get(r) ?? 0) + 1);
  return [...counts].map(([r, n]) => `Room ${r}${n > 1 ? ` ×${n}` : ""}`).join(", ");
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="mb-2 text-xs font-semibold tracking-widest text-muted">{children}</h3>;
}

/** "Draft shift handoff" → POST /api/report/handoff. Neutral: red/yellow stay reserved for alarms. */
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
        setState({ kind: "error", message: `Too many requests. Try again in ${sec ?? "a few"} seconds.` });
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
    <section aria-label="Shift handoff" className="rounded-card border border-line bg-surface-2 p-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="mr-auto">
          <h2 className="text-sm font-semibold text-ink">Shift handoff</h2>
          <p className="text-xs text-muted">A morning briefing drafted from tonight&apos;s alerts.</p>
        </div>
        {state.kind === "done" && (
          <button
            type="button"
            onClick={() => copy(state.handoff.text)}
            className="min-h-10 rounded-lg border border-line-2 px-3 text-sm text-ink hover:bg-surface-2"
          >
            <span className="inline-flex items-center gap-1.5">{copied ? <Check size={16} weight="bold" aria-hidden /> : <Copy size={16} aria-hidden />}{copied ? "Copied" : "Copy"}</span>
          </button>
        )}
        <button
          type="button"
          onClick={generate}
          disabled={loading}
          className="inline-flex h-10 items-center rounded-btn bg-brand px-4 text-sm font-semibold text-on-brand hover:bg-brand-hover disabled:opacity-60"
        >
          {loading ? "Drafting…" : state.kind === "done" ? "Draft again" : "Draft shift handoff"}
        </button>
      </div>

      <div aria-live="polite" className="mt-3 empty:mt-0">
        {loading && <p className="text-sm text-muted">Reading tonight&apos;s alerts and drafting the handoff…</p>}
        {state.kind === "error" && <p className="text-sm text-ink">{state.message}</p>}
      </div>

      {state.kind === "done" && <HandoffBody handoff={state.handoff} />}
    </section>
  );
}

function HandoffBody({ handoff: h }: { handoff: Handoff }) {
  return (
    <div className="mt-1 flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
        <span className="rounded-full border border-line-2 bg-surface-2 px-2 py-0.5 font-medium text-ink">
          {h.source === "claude" ? <span className="inline-flex items-center gap-1"><Sparkle size={14} weight="bold" aria-hidden /> Drafted by Claude</span> : "Rule-based (Claude unavailable)"}
        </span>
        <span>
          {h.totals.alerts} alerts · {h.totals.escalations} escalated · {h.totals.open} not resolved ·{" "}
          {new Date(h.generatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </span>
      </div>

      <div>
        <SectionTitle>Needs attention this morning</SectionTitle>
        {h.needsAttention.length === 0 ? (
          <p className="text-sm text-ink">No one needs extra attention. Quiet night.</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {h.needsAttention.map((a) => (
              <li key={a.room} className="flex gap-3 rounded-lg bg-surface px-3 py-2 text-sm">
                <span className="shrink-0 font-mono font-semibold text-ink">Rm {a.room}</span>
                <span className="text-ink">
                  <span className="font-medium text-ink">{a.name}:</span> {a.reason}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <SectionTitle>By nurse</SectionTitle>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-muted">
              <tr>
                <th scope="col" className="py-1 pr-3 font-medium">Nurse</th>
                <th scope="col" className="py-1 pr-3 font-medium">Handled</th>
                <th scope="col" className="py-1 pr-3 font-medium">Average response</th>
                <th scope="col" className="py-1 font-medium">Left open</th>
              </tr>
            </thead>
            <tbody>
              {h.nurses.map((n) => (
                <tr key={n.nurseId} className="border-t border-line align-top">
                  <th scope="row" className="py-1.5 pr-3 font-medium text-ink">
                    {n.name} <span className="text-xs font-normal text-muted">{n.role}</span>
                    {n.note && <div className="text-xs font-normal text-muted">{n.note}</div>}
                  </th>
                  <td className="py-1.5 pr-3 font-mono text-ink">
                    {n.handled}/{n.alerts}
                  </td>
                  <td className="py-1.5 pr-3 font-mono text-ink">{formatAvg(n.avgResponseMs)}</td>
                  <td className="py-1.5 text-ink">
                    {n.open.length ? roomCounts(n.open.map((o) => o.room)) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <SectionTitle>Recommendations</SectionTitle>
        <ol className="flex list-decimal flex-col gap-1 pl-5 text-sm text-ink marker:text-muted">
          {h.recommendations.map((r, i) => (
            <li key={i}>{r}</li>
          ))}
        </ol>
      </div>

      <p className="text-xs text-muted">
        {h.source === "claude"
          ? "Drafted by Claude. The numbers come from the alert log. Check before acting. Fictional demo data."
          : "Built from simple rules over the alert log. Fictional demo data."}
      </p>
    </div>
  );
}
