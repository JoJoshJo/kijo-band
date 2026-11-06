"use client";

import { X } from "@phosphor-icons/react";
import { useEffect } from "react";

export default function Modal({
  title,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={title}>
      <button type="button" aria-label="Close" tabIndex={-1} onClick={onClose} className="absolute inset-0 bg-scrim" />
      <div
        className={`kijo-modal-enter relative max-h-[calc(100dvh-2rem)] w-full overflow-y-auto rounded-card border border-line-2 bg-surface p-6 shadow-2xl ${
          wide ? "max-w-2xl" : "max-w-md"
        }`}
      >
        <div className="mb-4 flex items-center justify-between gap-4">
          <h2 className="text-xl font-semibold text-ink">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-9 w-9 items-center justify-center rounded-btn text-muted transition-colors hover:bg-surface-2 hover:text-ink"
          >
            <X size={20} aria-hidden />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
