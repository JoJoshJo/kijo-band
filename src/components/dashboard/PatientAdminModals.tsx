"use client";

import { useState } from "react";
import { MAIN_NURSE_ID } from "@/lib/demoConfig";
import { validateNewPatient } from "@/lib/adminPatients";
import type { Language, Nurse, Resident } from "@/lib/types";
import Modal from "./Modal";
import { AdminSecretInput, ModalActions, inputClass, useAdminSecret } from "./adminClient";
import { residentTitle } from "./util";

// Charge view patient management (all behind DEMO_ADMIN_SECRET): add, move, remove, clear QR guests.

const LANG_LABEL: Record<Language, string> = { en: "English", fr: "Français", es: "Español" };

function useSubmit(onDone: () => void, onClose: () => void) {
  const admin = useAdminSecret();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ text: string; field?: string } | null>(null);
  async function run(url: string, method: "POST" | "PATCH", body?: unknown) {
    setBusy(true);
    setError(null);
    const r = await admin.send(url, method, body);
    setBusy(false);
    if (!r.ok) return setError({ text: r.error, field: r.field });
    onDone();
    onClose();
  }
  return { admin, busy, error, setError, run };
}

function ErrorLine({ text }: { text?: string }) {
  if (!text) return null;
  return (
    <p role="alert" className="text-sm text-ink">
      {text}
    </p>
  );
}

const assignable = (nurses: Nurse[]) => nurses.filter((n) => n.role !== "Charge");

export function AddPatientModal({ nurses, onClose, onDone }: { nurses: Nurse[]; onClose: () => void; onDone: () => void }) {
  const { admin, busy, error, setError, run } = useSubmit(onDone, onClose);
  const choices = assignable(nurses);
  const [name, setName] = useState("");
  const [room, setRoom] = useState("");
  const [language, setLanguage] = useState<Language>("en");
  const [canSpeak, setCanSpeak] = useState(true);
  const [nurseId, setNurseId] = useState(choices.some((n) => n.id === MAIN_NURSE_ID) ? MAIN_NURSE_ID : (choices[0]?.id ?? ""));

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const body = { name, room, language, canSpeak, nurseId };
    const checked = validateNewPatient(body); // same rules as the server, for instant feedback
    if (!checked.ok) return setError({ text: checked.error, field: checked.field });
    void run("/api/admin/residents", "POST", checked.value);
  }

  return (
    <Modal title="Add patient" onClose={onClose}>
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        <div className="grid grid-cols-[1fr_7rem] gap-3">
          <label className="flex flex-col gap-1 text-sm text-muted">
            Name
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Mrs. Rivera"
              maxLength={40}
              aria-invalid={error?.field === "name"}
              className={inputClass}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm text-muted">
            Room
            <input
              value={room}
              onChange={(e) => setRoom(e.target.value)}
              placeholder="25"
              maxLength={6}
              aria-invalid={error?.field === "room"}
              className={`${inputClass} num`}
            />
          </label>
        </div>
        <fieldset className="flex flex-col gap-1 text-sm text-muted">
          <legend className="mb-1">Language</legend>
          <div className="grid grid-cols-3 gap-2">
            {(Object.keys(LANG_LABEL) as Language[]).map((l) => (
              <Choice key={l} name="language" checked={language === l} onChange={() => setLanguage(l)} label={LANG_LABEL[l]} />
            ))}
          </div>
        </fieldset>
        <fieldset className="flex flex-col gap-1 text-sm text-muted">
          <legend className="mb-1">Can speak</legend>
          <div className="grid grid-cols-2 gap-2">
            <Choice name="speak" checked={canSpeak} onChange={() => setCanSpeak(true)} label="Yes" />
            <Choice name="speak" checked={!canSpeak} onChange={() => setCanSpeak(false)} label="No (non-verbal)" />
          </div>
        </fieldset>
        <label className="flex flex-col gap-1 text-sm text-muted">
          Nurse
          <select value={nurseId} onChange={(e) => setNurseId(e.target.value)} className={inputClass}>
            {choices.map((n) => (
              <option key={n.id} value={n.id}>
                {n.name} · {n.role}
              </option>
            ))}
          </select>
        </label>
        {admin.needsSecret && <AdminSecretInput value={admin.typed} onChange={admin.setTyped} />}
        <ErrorLine text={error?.text} />
        <ModalActions onCancel={onClose} submitLabel="Add patient" busyLabel="Adding…" busy={busy} />
      </form>
    </Modal>
  );
}

function Choice({ name, checked, onChange, label }: { name: string; checked: boolean; onChange: () => void; label: string }) {
  return (
    <label
      className={`flex h-10 cursor-pointer items-center justify-center rounded-btn border px-2 text-sm transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-brand ${
        checked ? "border-ink bg-surface-2 font-semibold text-ink" : "border-line-2 text-muted hover:text-ink"
      }`}
    >
      <input type="radio" name={name} checked={checked} onChange={onChange} className="sr-only" />
      {label}
    </label>
  );
}

export function MovePatientModal({
  resident,
  nurses,
  onClose,
  onDone,
}: {
  resident: Resident;
  nurses: Nurse[];
  onClose: () => void;
  onDone: () => void;
}) {
  const { admin, busy, error, run } = useSubmit(onDone, onClose);
  const choices = assignable(nurses).filter((n) => n.id !== resident.assignedNurseId);
  const [nurseId, setNurseId] = useState(choices[0]?.id ?? "");
  const current = nurses.find((n) => n.id === resident.assignedNurseId);

  return (
    <Modal title="Move to nurse" onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void run(`/api/admin/residents/${encodeURIComponent(resident.id)}`, "PATCH", { action: "move", nurseId });
        }}
        className="flex flex-col gap-4"
      >
        <p className="text-sm text-ink">
          <b>{residentTitle(resident)}</b>
          {current && <span className="text-muted"> · now with {current.name}</span>}. Open alerts move too.
        </p>
        <fieldset className="grid gap-2">
          <legend className="sr-only">New nurse</legend>
          {choices.map((n) => (
            <Choice key={n.id} name="nurse" checked={nurseId === n.id} onChange={() => setNurseId(n.id)} label={`${n.name} · ${n.role}`} />
          ))}
        </fieldset>
        {admin.needsSecret && <AdminSecretInput value={admin.typed} onChange={admin.setTyped} />}
        <ErrorLine text={error?.text} />
        <ModalActions onCancel={onClose} submitLabel="Move patient" busyLabel="Moving…" busy={busy} disabled={!nurseId} />
      </form>
    </Modal>
  );
}

export function RemovePatientModal({
  resident,
  openAlerts,
  onClose,
  onDone,
}: {
  resident: Resident;
  openAlerts: number;
  onClose: () => void;
  onDone: () => void;
}) {
  const { admin, busy, error, run } = useSubmit(onDone, onClose);
  return (
    <Modal title="Remove patient?" onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void run(`/api/admin/residents/${encodeURIComponent(resident.id)}`, "PATCH", { action: "remove" });
        }}
        className="flex flex-col gap-4"
      >
        <p className="text-sm text-ink">
          <b>{residentTitle(resident)}</b> leaves every view
          {openAlerts > 0 && (
            <>
              {" "}
              and <b>{openAlerts === 1 ? "1 open alert is" : `${openAlerts} open alerts are`} resolved</b>
            </>
          )}
          .{" "}
          {resident.isGuest
            ? "This QR guest is deleted; the phone can join again."
            : "Reset demo brings this resident back."}
        </p>
        {admin.needsSecret && <AdminSecretInput value={admin.typed} onChange={admin.setTyped} />}
        <ErrorLine text={error?.text} />
        <ModalActions onCancel={onClose} submitLabel="Remove patient" busyLabel="Removing…" busy={busy} />
      </form>
    </Modal>
  );
}

export function ClearGuestsModal({ count, onClose, onDone }: { count: number; onClose: () => void; onDone: () => void }) {
  const { admin, busy, error, run } = useSubmit(onDone, onClose);
  return (
    <Modal title="Clear test patients?" onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void run("/api/admin/guests/clear", "POST");
        }}
        className="flex flex-col gap-4"
      >
        <p className="text-sm text-ink">
          Deletes <b>{count === 1 ? "1 joined guest" : `${count} joined guests`}</b> (QR test patients) and their
          alerts. Demo residents stay. Phones can join again.
        </p>
        {admin.needsSecret && <AdminSecretInput value={admin.typed} onChange={admin.setTyped} />}
        <ErrorLine text={error?.text} />
        <ModalActions onCancel={onClose} submitLabel={`Clear ${count}`} busyLabel="Clearing…" busy={busy} disabled={count === 0} />
      </form>
    </Modal>
  );
}
