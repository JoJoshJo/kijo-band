"use client";

import { useState } from "react";
import Modal from "./Modal";
import { AdminSecretInput, ModalActions, useAdminSecret } from "./adminClient";

export default function ResetModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const admin = useAdminSecret();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function reset(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const r = await admin.send("/api/admin/reset", "POST");
    setBusy(false);
    if (!r.ok) return setError(r.error);
    onDone();
    onClose();
  }

  return (
    <Modal title="Reset the demo?" onClose={onClose}>
      <form onSubmit={reset} className="flex flex-col gap-4">
        <p className="text-sm text-ink">
          This deletes <b>all alerts</b> and <b>all joined residents</b>, brings back removed residents, and sets
          every resident to OK and every nurse to available. You can&apos;t undo it.
        </p>
        {admin.needsSecret && <AdminSecretInput value={admin.typed} onChange={admin.setTyped} />}
        {error && (
          <p role="alert" className="text-sm text-ink">
            {error}
          </p>
        )}
        <ModalActions onCancel={onClose} submitLabel="Reset demo" busyLabel="Resetting…" busy={busy} />
      </form>
    </Modal>
  );
}
