"use client";

import { useState, useSyncExternalStore, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { Language } from "@/lib/types";

const DEVICE_KEY = "kijo.deviceId";
const RESIDENT_KEY = "kijo.residentId"; // same key /band falls back to
const NAME_MAX = 20;

const LANG_OPTIONS: { code: Language; label: string }[] = [
  { code: "en", label: "English" },
  { code: "fr", label: "Français" },
  { code: "es", label: "Español" },
];

/** Random per-phone id kept in localStorage, so joining again returns the same guest. */
function getDeviceId(): string {
  try {
    const existing = localStorage.getItem(DEVICE_KEY);
    if (existing && /^[A-Za-z0-9_-]{16,64}$/.test(existing)) return existing;
  } catch {
    // Private mode: a fresh id each time (still works, just no rejoin).
  }
  const bytes = crypto.getRandomValues(new Uint8Array(18)); // works on plain http too, unlike randomUUID
  const id = btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  try {
    localStorage.setItem(DEVICE_KEY, id);
  } catch {}
  return id;
}

const noopSubscribe = () => () => {};
function browserLanguage(): Language {
  const l = navigator.language.slice(0, 2).toLowerCase();
  return l === "fr" || l === "es" ? l : "en";
}

type Status = { kind: "idle" } | { kind: "joining" } | { kind: "full" } | { kind: "error"; message: string };

export default function JoinForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [language, setLanguage] = useState<Language | null>(null);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  // Pre-select the phone's language (server render: English, so hydration matches).
  const phoneLang = useSyncExternalStore(noopSubscribe, browserLanguage, () => "en" as Language);
  const lang = language ?? phoneLang;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (status.kind === "joining") return;
    setStatus({ kind: "joining" });
    try {
      const res = await fetch("/api/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceId: getDeviceId(), name: name.trim() || undefined, language: lang }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.status === 409 && body.full) return setStatus({ kind: "full" });
      if (!res.ok || typeof body.residentId !== "string") {
        return setStatus({ kind: "error", message: body.error ?? `Something went wrong (${res.status})` });
      }
      try {
        localStorage.setItem(RESIDENT_KEY, body.residentId);
      } catch {}
      router.replace(`/band?resident=${encodeURIComponent(body.residentId)}`);
    } catch {
      setStatus({ kind: "error", message: "No connection. Try again." });
    }
  }

  if (status.kind === "full") {
    return (
      <div className="mt-10 w-full max-w-sm rounded-2xl border border-slate-700 bg-slate-900 p-6 text-center">
        <div className="text-2xl font-semibold">Demo is full</div>
        <p className="mt-2 text-lg text-slate-400">All 15 guest rooms are taken. Watch the big screen instead!</p>
      </div>
    );
  }

  const joining = status.kind === "joining";
  return (
    <form onSubmit={onSubmit} className="mt-8 flex w-full max-w-sm flex-col gap-6">
      <label className="flex flex-col gap-2">
        <span className="text-lg text-slate-300">Your name (optional)</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value.slice(0, NAME_MAX))}
          maxLength={NAME_MAX}
          autoComplete="given-name"
          placeholder="Guest"
          className="rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-xl text-white outline-none placeholder:text-slate-600 focus:border-teal-400"
        />
      </label>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-lg text-slate-300">Language</legend>
        <div className="grid grid-cols-3 gap-2">
          {LANG_OPTIONS.map((o) => (
            <button
              key={o.code}
              type="button"
              aria-pressed={lang === o.code}
              onClick={() => setLanguage(o.code)}
              className={`rounded-xl border px-2 py-3 text-lg font-medium ${
                lang === o.code ? "border-teal-400 bg-teal-500 text-black" : "border-slate-700 bg-slate-900 text-white"
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
      </fieldset>

      <button
        type="submit"
        disabled={joining}
        className="mt-2 rounded-full bg-teal-500 py-4 text-2xl font-bold text-black shadow-[0_0_40px_rgba(20,184,166,0.4)] active:scale-95 disabled:opacity-60"
      >
        {joining ? "Joining…" : "Get my band"}
      </button>
      {status.kind === "error" && <p className="text-center text-lg text-red-400">{status.message}</p>}
    </form>
  );
}
