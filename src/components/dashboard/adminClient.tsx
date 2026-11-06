"use client";

import { useState } from "react";
import useSWR from "swr";

// Client side of /api/admin/**. When the server runs with ADMIN_OPEN=1 (/api/admin/mode says open),
// no secret is asked. Otherwise the admin secret is asked once per browser-tab session
// (sessionStorage) and forgotten on a 401.

export const ADMIN_SECRET_KEY = "kijo-admin-secret";

export type AdminResult = { ok: true; data: Record<string, unknown> } | { ok: false; error: string; field?: string };

export function useAdminSecret() {
  const [stored, setStored] = useState(() =>
    typeof window === "undefined" ? "" : (sessionStorage.getItem(ADMIN_SECRET_KEY) ?? ""),
  );
  const [typed, setTyped] = useState("");
  const { data: mode } = useSWR<{ open: boolean }>("/api/admin/mode", (u: string) => fetch(u).then((r) => r.json()), {
    revalidateOnFocus: false,
  });
  const open = mode?.open === true;

  /** Sends the request with the stored or typed secret; remembers it on success, forgets it on 401. */
  async function send(url: string, method: "POST" | "PATCH", body?: unknown): Promise<AdminResult> {
    const secret = stored || typed;
    if (!secret && !open) return { ok: false, error: "Enter the admin secret.", field: "secret" };
    try {
      const res = await fetch(url, {
        method,
        headers: {
          ...(secret ? { "x-admin-secret": secret } : {}),
          ...(body ? { "content-type": "application/json" } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (res.status === 401) {
        sessionStorage.removeItem(ADMIN_SECRET_KEY);
        setStored("");
        return { ok: false, error: "That admin secret is not right. Check it and try again.", field: "secret" };
      }
      if (res.status === 429) return { ok: false, error: "Too many tries. Wait a minute, then try again." };
      if (!res.ok) {
        return { ok: false, error: String(data.error ?? `HTTP ${res.status}`), field: data.field as string | undefined };
      }
      if (secret) {
        sessionStorage.setItem(ADMIN_SECRET_KEY, secret);
        setStored(secret);
      }
      return { ok: true, data };
    } catch {
      return { ok: false, error: "Could not reach the server. Check the connection and try again." };
    }
  }

  // While the mode is loading the field stays hidden, so it doesn't flash in open mode.
  return { needsSecret: mode !== undefined && !open && !stored, typed, setTyped, send };
}

export const inputClass =
  "h-10 rounded-btn border border-line-2 bg-surface-2 px-3 text-ink placeholder:text-muted focus-visible:border-brand";

export function AdminSecretInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <label className="flex flex-col gap-1 text-sm text-muted">
      Admin secret
      <input
        type="password"
        autoComplete="off"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={inputClass}
      />
    </label>
  );
}

export function ModalActions({
  onCancel,
  submitLabel,
  busyLabel,
  busy,
  disabled,
}: {
  onCancel: () => void;
  submitLabel: string;
  busyLabel: string;
  busy: boolean;
  disabled?: boolean;
}) {
  return (
    <div className="flex justify-end gap-2">
      <button
        type="button"
        onClick={onCancel}
        className="inline-flex h-10 items-center rounded-btn px-4 text-sm text-ink transition-colors hover:bg-surface-2"
      >
        Cancel
      </button>
      <button
        type="submit"
        disabled={busy || disabled}
        className="inline-flex h-10 items-center rounded-btn bg-brand px-4 text-sm font-semibold text-on-brand transition-colors hover:bg-brand-hover disabled:opacity-50"
      >
        {busy ? busyLabel : submitLabel}
      </button>
    </div>
  );
}
