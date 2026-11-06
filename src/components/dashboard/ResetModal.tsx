"use client";

import { useState } from "react";
import Modal from "./Modal";

const SECRET_KEY = "kijo-admin-secret"; // sessionStorage: asked once per browser tab session

export default function ResetModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [stored, setStored] = useState(() => sessionStorage.getItem(SECRET_KEY) ?? "");
  const [secret, setSecret] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function reset(e: React.FormEvent) {
    e.preventDefault();
    const value = stored || secret;
    if (!value) return setError("Enter the admin secret");
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/reset", { method: "POST", headers: { "x-admin-secret": value } });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) {
        sessionStorage.removeItem(SECRET_KEY);
        setStored("");
        setError("Wrong admin secret");
        return;
      }
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      sessionStorage.setItem(SECRET_KEY, value);
      onDone();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reset failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="Reset demo?" onClose={onClose}>
      <form onSubmit={reset} className="flex flex-col gap-4">
        <p className="text-sm text-slate-300">
          Clears <b>all alerts</b> and <b>guest residents</b>, and resets every resident and nurse status. This
          cannot be undone.
        </p>
        {!stored && (
          <label className="flex flex-col gap-1 text-sm text-slate-400">
            Admin secret
            <input
              type="password"
              autoFocus
              autoComplete="off"
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              className="rounded border border-slate-700 bg-slate-950 px-3 py-2 text-white"
            />
          </label>
        )}
        {error && <p className="text-sm text-orange-300">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded px-4 py-2 text-sm text-slate-300 hover:bg-slate-800">
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy}
            className="rounded bg-orange-600 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-500 disabled:opacity-50"
          >
            {busy ? "Resetting…" : "Reset demo"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
