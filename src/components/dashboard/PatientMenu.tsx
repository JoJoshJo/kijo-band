"use client";

import { ArrowsLeftRight, DotsThree, UserMinus } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import type { Resident } from "@/lib/types";
import { residentTitle } from "./util";

export type PatientAction = "move" | "remove";

/** Small "…" menu in a tile's top-right corner (Charge view): Move to nurse / Remove resident. */
export default function PatientMenu({ resident, onAction }: { resident: Resident; onAction: (a: PatientAction) => void }) {
  const [open, setOpen] = useState(false);
  const [alignLeft, setAlignLeft] = useState(false); // open rightwards when there is no room on the left
  const root = useRef<HTMLDivElement>(null);
  const firstItem = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    firstItem.current?.focus();
    const onDown = (e: PointerEvent) => !root.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        root.current?.querySelector<HTMLButtonElement>("button")?.focus();
      }
    };
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const pick = (a: PatientAction) => {
    setOpen(false);
    onAction(a);
  };
  const item =
    "flex w-full items-center gap-2 rounded-btn px-3 py-2 text-left text-sm text-ink transition-colors hover:bg-surface-2 focus-visible:bg-surface-2";

  return (
    <div ref={root} className="absolute right-1.5 top-1.5 z-10">
      <button
        type="button"
        aria-label={`Manage ${residentTitle(resident)}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(e) => {
          setAlignLeft(e.currentTarget.getBoundingClientRect().right < 224);
          setOpen((o) => !o);
        }}
        className="flex h-8 w-8 items-center justify-center rounded-btn text-muted transition-colors hover:bg-surface hover:text-ink"
      >
        <DotsThree size={20} weight="bold" aria-hidden />
      </button>
      {open && (
        <div
          role="menu"
          aria-label={residentTitle(resident)}
          className={`absolute top-9 w-52 ${alignLeft ? "left-0" : "right-0"} rounded-card border border-line-2 bg-surface p-1 shadow-2xl`}
        >
          <button ref={firstItem} type="button" role="menuitem" onClick={() => pick("move")} className={item}>
            <ArrowsLeftRight size={16} aria-hidden className="text-muted" />
            Move to nurse
          </button>
          <button type="button" role="menuitem" onClick={() => pick("remove")} className={item}>
            <UserMinus size={16} aria-hidden className="text-muted" />
            Remove resident
          </button>
        </div>
      )}
    </div>
  );
}
