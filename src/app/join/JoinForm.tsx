"use client";

import { useState, useSyncExternalStore, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { NAME_ERROR_TEXT, NAME_MAX, validateName, type NameError } from "@/lib/guestName";
import type { Language } from "@/lib/types";

const DEVICE_KEY = "kijo.deviceId";
const RESIDENT_KEY = "kijo.residentId"; // same key /band falls back to

const UI: Record<Language, { name: string; placeholder: string; language: string; join: string; joining: string }> = {
  en: { name: "Your name", placeholder: "e.g. Sam", language: "Language", join: "Get my band", joining: "Joining…" },
  fr: { name: "Votre prénom", placeholder: "ex. Camille", language: "Langue", join: "Obtenir mon bracelet", joining: "Connexion…" },
  es: { name: "Su nombre", placeholder: "p. ej. Lucía", language: "Idioma", join: "Obtener mi pulsera", joining: "Conectando…" },
};

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

type Status =
  | { kind: "idle" }
  | { kind: "joining" }
  | { kind: "full" }
  | { kind: "error"; message: string }
  | { kind: "name"; error: NameError };

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
    const checked = validateName(name);
    if (!checked.ok) return setStatus({ kind: "name", error: checked.error });
    setStatus({ kind: "joining" });
    try {
      const res = await fetch("/api/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceId: getDeviceId(), name: checked.name, language: lang }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.status === 409 && body.full) return setStatus({ kind: "full" });
      if (res.status === 400 && typeof body.code === "string" && body.code in NAME_ERROR_TEXT.en) {
        return setStatus({ kind: "name", error: body.code as NameError });
      }
      if (!res.ok || typeof body.residentId !== "string") {
        return setStatus({ kind: "error", message: body.error ?? "Could not join. Try again." });
      }
      try {
        localStorage.setItem(RESIDENT_KEY, body.residentId);
      } catch {}
      router.replace(`/band?resident=${encodeURIComponent(body.residentId)}`);
    } catch {
      setStatus({ kind: "error", message: "No connection. Check your Wi-Fi or data, then try again." });
    }
  }

  if (status.kind === "full") {
    return (
      <div className="mt-10 w-full max-w-sm rounded-btn border border-line-2 bg-surface p-6 text-center">
        <div className="text-2xl font-semibold">The demo is full</div>
        <p className="mt-2 text-xl text-muted">All 15 places are taken. You can follow along on the big screen.</p>
      </div>
    );
  }

  const joining = status.kind === "joining";
  const t = UI[lang];
  const nameError = status.kind === "name" ? NAME_ERROR_TEXT[lang][status.error] : null;
  return (
    <form onSubmit={onSubmit} noValidate className="mt-8 flex w-full max-w-sm flex-col gap-6">
      <label className="flex flex-col gap-2">
        <span className="text-xl text-muted">{t.name}</span>
        <input
          value={name}
          onChange={(e) => {
            setName(e.target.value.slice(0, NAME_MAX + 5)); // validation explains the limit
            if (status.kind === "name") setStatus({ kind: "idle" });
          }}
          required
          maxLength={NAME_MAX + 5}
          autoComplete="given-name"
          autoCapitalize="words"
          enterKeyHint="go"
          placeholder={t.placeholder}
          aria-invalid={nameError ? true : undefined}
          aria-describedby={nameError ? "join-name-error" : undefined}
          className={`rounded-btn border bg-surface px-4 py-3 text-xl text-ink outline-none placeholder:text-muted focus:border-brand ${
            nameError ? "border-ink" : "border-line-2"
          }`}
        />
        {nameError && (
          <span id="join-name-error" role="alert" className="text-lg text-ink">
            {nameError}
          </span>
        )}
      </label>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-xl text-muted">{t.language}</legend>
        <div className="grid grid-cols-3 gap-2">
          {LANG_OPTIONS.map((o) => (
            <button
              key={o.code}
              type="button"
              aria-pressed={lang === o.code}
              onClick={() => setLanguage(o.code)}
              className={`rounded-btn border px-2 py-3 text-xl font-medium ${
                lang === o.code ? "border-brand bg-brand text-on-brand" : "border-line-2 bg-surface text-ink"
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
        className="mt-2 rounded-full bg-brand py-4 text-2xl font-semibold text-on-brand shadow-[0_0_40px_rgba(43,179,163,0.35)] active:scale-95 disabled:opacity-60"
      >
        {joining ? t.joining : t.join}
      </button>
      {status.kind === "error" && (
        <p role="alert" className="text-center text-xl text-ink">
          {status.message}
        </p>
      )}
    </form>
  );
}
